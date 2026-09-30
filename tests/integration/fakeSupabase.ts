// tests/integration/fakeSupabase.ts — in-memory stand-in for the Supabase client used by the server, so API tests
// never touch the real database (rules.md AR-31). Tables, defaults, NOT NULL, UNIQUE, CHECK and foreign keys are read
// from supabase/schema.sql, so a column the server writes that the schema doesn't have fails here too.
// Supports exactly the query-builder calls the server makes: select/insert/update/delete, eq, neq, in, is, not('is'),
// order, limit, single, maybeSingle — plus Storage (upload/download/sign/list/remove) and auth.getUser/signIn.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Row = Record<string, unknown>;
type PgError = { code: string; message: string; details: null; hint: null };
type Result = { data: unknown; error: PgError | null };

interface Column {
  name: string;
  type: string;
  notNull: boolean;
  unique: boolean;
  makeDefault?: () => unknown;
  references?: { table: string; column: string };
  check?: (v: unknown) => boolean;
}
interface Table { name: string; columns: Map<string, Column>; rows: Row[] }

const pgError = (code: string, message: string): PgError => ({ code, message, details: null, hint: null });
const clone = <T>(v: T): T => structuredClone(v);

// Strictly increasing clock: rows inserted in the same millisecond still sort in insertion order.
let lastMs = 0;
const nowIso = () => {
  lastMs = Math.max(Date.now(), lastMs + 1);
  return new Date(lastMs).toISOString();
};

function parseDefault(raw: string, type: string): () => unknown {
  if (raw === 'gen_random_uuid()') return () => randomUUID();
  if (raw === 'now()') return nowIso;
  if (raw === 'true' || raw === 'false') return () => raw === 'true';
  if (/^-?\d+(\.\d+)?$/.test(raw)) return () => Number(raw);
  const quoted = raw.match(/^'(.*)'$/);
  if (quoted) {
    if (type.endsWith('[]')) return () => []; // the schema only uses '{}'
    if (type === 'jsonb') return () => JSON.parse(quoted[1]);
    return () => quoted[1];
  }
  throw new Error(`fakeSupabase: unsupported default ${raw}`);
}

const CHECKS: Record<string, (a: number, b: number) => boolean> = {
  '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b,
};

export function parseSchema(sql: string): Map<string, Table> {
  const tables = new Map<string, Table>();
  for (const [, name, body] of sql.matchAll(/create table if not exists (\w+) \(([\s\S]*?)\n\);/g)) {
    const columns = new Map<string, Column>();
    for (const raw of body.split('\n')) {
      const line = raw.replace(/--.*$/, '').trim().replace(/,$/, '');
      const m = line.match(/^(\w+)\s+(double precision|\w+(?:\[\])?)(.*)$/);
      if (!m) continue;
      const [, col, type, rest] = m;
      const def = rest.match(/default\s+('[^']*'|[\w.()]+)/);
      const ref = rest.match(/references\s+([\w.]+)\s*\((\w+)\)/);
      const chk = rest.match(/check\s*\((\w+)\s*(>=|>|<=|<)\s*(-?\d+)\)/);
      columns.set(col, {
        name: col,
        type,
        notNull: /not null|primary key/.test(rest),
        unique: /primary key|unique/.test(rest),
        makeDefault: def ? parseDefault(def[1], type) : undefined,
        // References into other schemas (profiles → auth.users) are Supabase-internal and not modelled.
        references: ref && !ref[1].includes('.') ? { table: ref[1], column: ref[2] } : undefined,
        check: chk ? (v) => v === null || CHECKS[chk[2]](v as number, Number(chk[3])) : undefined,
      });
    }
    tables.set(name, { name, columns, rows: [] });
  }
  return tables;
}

// ------------------------------------------------------------------------------------------------ database

export class FakeDb {
  readonly tables: Map<string, Table>;
  constructor(schemaSql: string) {
    this.tables = parseSchema(schemaSql);
  }

  table(name: string): Table | undefined {
    return this.tables.get(name);
  }

  reset(): void {
    for (const t of this.tables.values()) t.rows = [];
    this.faults = [];
    this.outage = false;
  }

  /** Number of queries run so far (each one is a network round-trip to Supabase in production). */
  queryCount = 0;

  // ---- simulated network failures (the error supabase-js returns when fetch fails)
  /** While true, every query fails. */
  outage = false;
  private faults: { table: string; op: string; times: number }[] = [];
  /** Make the next `times` queries on `table` with operation `op` fail ('*' matches any). */
  failNext(table = '*', op: 'select' | 'insert' | 'update' | 'delete' | '*' = '*', times = 1): void {
    this.faults.push({ table, op, times });
  }
  takeFault(table: string, op: string): boolean {
    if (this.outage) return true;
    const f = this.faults.find((x) => (x.table === '*' || x.table === table) && (x.op === '*' || x.op === op));
    if (!f) return false;
    if (--f.times <= 0) this.faults.splice(this.faults.indexOf(f), 1);
    return true;
  }

  /** Test helper: current rows of a table (copies). */
  rows(name: string): Row[] {
    return clone(this.tables.get(name)?.rows ?? []);
  }

  /** Every constraint a row must satisfy, given the rest of the table's final rows. Returns an error or null. */
  validate(t: Table, row: Row, others: Row[]): PgError | null {
    for (const c of t.columns.values()) {
      const v = row[c.name];
      if (c.notNull && (v === null || v === undefined)) {
        return pgError('23502', `null value in column "${c.name}" of relation "${t.name}" violates not-null constraint`);
      }
      if (c.check && !c.check(v)) return pgError('23514', `new row for relation "${t.name}" violates check constraint on "${c.name}"`);
      if (c.unique && v !== null && others.some((o) => o[c.name] === v)) {
        return pgError('23505', `duplicate key value violates unique constraint "${t.name}_${c.name}_key"`);
      }
      if (c.references && v !== null && v !== undefined) {
        const target = this.tables.get(c.references.table);
        if (!target?.rows.some((r) => r[c.references!.column] === v) && !(c.references.table === t.name && others.concat(row).some((r) => r[c.references!.column] === v))) {
          return pgError('23503', `insert or update on table "${t.name}" violates foreign key constraint on "${c.name}"`);
        }
      }
    }
    return null;
  }

  /** Rows elsewhere that still point at `rows` of table `t` (there are no ON DELETE CASCADE rules in the schema). */
  referencing(t: Table, rows: Row[]): string | null {
    for (const other of this.tables.values()) {
      for (const c of other.columns.values()) {
        if (c.references?.table !== t.name) continue;
        const ids = new Set(rows.map((r) => r[c.references!.column]));
        const blocking = other.rows.filter((r) => !(other === t && rows.includes(r)) && ids.has(r[c.name]));
        if (blocking.length) return `${other.name}.${c.name}`;
      }
    }
    return null;
  }

  from(table: string): Query {
    return new Query(this, table);
  }
}

type Filter = { col: string; test: (r: Row) => boolean };

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private columns: string[] | null = null; // null = '*'
  private returning = false;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private payload: Row[] | Row | null = null;

  constructor(private readonly db: FakeDb, private readonly tableName: string) {}

  select(columns = '*'): this {
    const cols = columns.trim() === '*' ? null : columns.split(',').map((c) => c.trim());
    if (this.op === 'select') this.columns = cols;
    else {
      this.returning = true;
      this.columns = cols;
    }
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }
  // SQL semantics: comparisons with NULL are never true.
  eq(col: string, v: unknown): this { return this.where(col, (r) => r[col] !== null && r[col] === v); }
  neq(col: string, v: unknown): this { return this.where(col, (r) => r[col] !== null && r[col] !== v); }
  in(col: string, values: unknown[]): this { return this.where(col, (r) => values.includes(r[col])); }
  is(col: string, v: null): this { return this.where(col, (r) => r[col] === v); }
  not(col: string, op: string, v: null): this {
    if (op !== 'is') throw new Error(`fakeSupabase: not(${op}) is not supported`);
    return this.where(col, (r) => r[col] !== v);
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  single(): this {
    this.mode = 'single';
    return this;
  }
  maybeSingle(): this {
    this.mode = 'maybe';
    return this;
  }

  then<A = Result, B = never>(onFulfilled?: ((v: Result) => A | PromiseLike<A>) | null, onRejected?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onFulfilled, onRejected);
  }

  private where(col: string, test: (r: Row) => boolean): this {
    this.filters.push({ col, test });
    return this;
  }

  private shape(rows: Row[]): Result {
    const t = this.db.table(this.tableName)!;
    const project = (r: Row): Row => (this.columns ? Object.fromEntries(this.columns.map((c) => [c, r[c]])) : r);
    for (const c of this.columns ?? []) if (!t.columns.has(c)) return { data: null, error: pgError('42703', `column ${this.tableName}.${c} does not exist`) };
    const out = clone(rows.map(project));
    if (this.mode === 'many') return { data: out, error: null };
    if (out.length === 1) return { data: out[0], error: null };
    if (out.length === 0 && this.mode === 'maybe') return { data: null, error: null };
    return { data: null, error: pgError('PGRST116', `JSON object requested, ${out.length} rows returned`) };
  }

  private matching(t: Table): Row[] {
    let rows = t.rows.filter((r) => this.filters.every((f) => f.test(r)));
    for (const { col, asc } of [...this.orders].reverse()) {
      // Postgres default: NULLS LAST ascending, NULLS FIRST descending. Stable sort keeps earlier keys' order.
      rows = [...rows].sort((a, b) => {
        const x = a[col];
        const y = b[col];
        if (x === y) return 0;
        if (x === null || x === undefined) return asc ? 1 : -1;
        if (y === null || y === undefined) return asc ? -1 : 1;
        return (x < y ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    return this.max === null ? rows : rows.slice(0, this.max);
  }

  private run(): Result {
    this.db.queryCount++;
    if (this.db.takeFault(this.tableName, this.op)) return { data: null, error: pgError('', 'TypeError: fetch failed (simulated network failure)') };
    const t = this.db.table(this.tableName);
    if (!t) return { data: null, error: pgError('42P01', `relation "${this.tableName}" does not exist`) };
    for (const f of [...this.filters, ...this.orders]) {
      if (!t.columns.has(f.col)) return { data: null, error: pgError('42703', `column ${t.name}.${f.col} does not exist`) };
    }

    if (this.op === 'select') return this.shape(this.matching(t));

    if (this.op === 'insert') {
      const fresh: Row[] = [];
      for (const given of this.payload as Row[]) {
        for (const k of Object.keys(given)) {
          if (!t.columns.has(k)) return { data: null, error: pgError('PGRST204', `Could not find the '${k}' column of '${t.name}' in the schema cache`) };
        }
        const row: Row = {};
        for (const c of t.columns.values()) {
          row[c.name] = c.name in given && given[c.name] !== undefined ? clone(given[c.name]) : c.makeDefault ? c.makeDefault() : null;
        }
        const problem = this.db.validate(t, row, [...t.rows, ...fresh]);
        if (problem) return { data: null, error: problem };
        fresh.push(row);
      }
      t.rows.push(...fresh);
      return this.returning ? this.shape(fresh) : { data: null, error: null };
    }

    // update / delete: Supabase blocks both without a WHERE clause (safeupdate).
    if (this.filters.length === 0) return { data: null, error: pgError('21000', `${this.op.toUpperCase()} requires a WHERE clause`) };
    const targets = this.matching(t);

    if (this.op === 'update') {
      const patch = this.payload as Row;
      for (const k of Object.keys(patch)) {
        if (!t.columns.has(k)) return { data: null, error: pgError('PGRST204', `Could not find the '${k}' column of '${t.name}' in the schema cache`) };
      }
      const updated = targets.map((r) => ({ ...r, ...clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))) }));
      const untouched = t.rows.filter((r) => !targets.includes(r));
      for (const [n, row] of updated.entries()) {
        const problem = this.db.validate(t, row, [...untouched, ...updated.filter((_, k) => k !== n)]);
        if (problem) return { data: null, error: problem };
      }
      targets.forEach((r, n) => Object.assign(r, updated[n]));
      return this.returning ? this.shape(targets) : { data: null, error: null };
    }

    const blocker = this.db.referencing(t, targets);
    if (blocker) return { data: null, error: pgError('23503', `update or delete on table "${t.name}" violates foreign key constraint (${blocker})`) };
    t.rows = t.rows.filter((r) => !targets.includes(r));
    return this.returning ? this.shape(targets) : { data: null, error: null };
  }
}

// ------------------------------------------------------------------------------------------------ storage + auth

export class FakeStorage {
  readonly files = new Map<string, { body: Buffer; contentType: string }>();
  from(bucket: string) {
    const key = (path: string) => `${bucket}/${path}`;
    const url = (path: string) => `https://storage.test/${bucket}/${path}?token=signed`;
    return {
      upload: async (path: string, body: Buffer, opts?: { contentType?: string; upsert?: boolean }) => {
        if (this.files.has(key(path)) && !opts?.upsert) return { data: null, error: { message: 'The resource already exists' } };
        this.files.set(key(path), { body: Buffer.from(body), contentType: opts?.contentType ?? 'application/octet-stream' });
        return { data: { path }, error: null };
      },
      download: async (path: string) => {
        const f = this.files.get(key(path));
        return f ? { data: new Blob([new Uint8Array(f.body)], { type: f.contentType }), error: null } : { data: null, error: { message: 'Object not found' } };
      },
      createSignedUrl: async (path: string, _seconds: number) =>
        this.files.has(key(path)) ? { data: { signedUrl: url(path) }, error: null } : { data: null, error: { message: 'Object not found' } },
      createSignedUrls: async (paths: string[], _seconds: number) => ({
        data: paths.map((p) => (this.files.has(key(p)) ? { path: p, signedUrl: url(p), error: null } : { path: p, signedUrl: null, error: 'Object not found' })),
        error: null,
      }),
      list: async (folder: string) => ({
        data: [...this.files.keys()].filter((k) => k.startsWith(key(folder) + '/')).map((k) => ({ name: k.slice(key(folder).length + 1), id: k })),
        error: null,
      }),
      remove: async (paths: string[]) => {
        for (const p of paths) this.files.delete(key(p));
        return { data: paths.map((name) => ({ name })), error: null };
      },
    };
  }
}

export class FakeAuth {
  private readonly users = new Map<string, { id: string; password: string }>(); // by email
  private readonly tokens = new Map<string, string>(); // token → user id

  addUser(email: string, password: string, id: string = randomUUID()): { id: string; token: string } {
    this.users.set(email.toLowerCase(), { id, password });
    const token = `test-token-${id}`;
    this.tokens.set(token, id);
    return { id, token };
  }
  reset(): void {
    this.users.clear();
    this.tokens.clear();
  }
  // Server (service role) API
  readonly service = {
    getUser: async (token: string) => {
      const id = this.tokens.get(token);
      return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
    },
  };
  // Anon API used for staff sign-in
  readonly anon = {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const u = this.users.get(email.toLowerCase());
      if (!u || u.password !== password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
      const token = [...this.tokens.entries()].find(([, id]) => id === u.id)![0];
      return { data: { user: { id: u.id }, session: { access_token: token } }, error: null };
    },
  };
}

// ------------------------------------------------------------------------------------------------ the mocked module

const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
export const fakeDb = new FakeDb(schema);
export const fakeStorage = new FakeStorage();
export const fakeAuth = new FakeAuth();

/** Shape of server/supabase.ts: `db` (service role) and `authClient` (anon). */
export const supabaseModule = {
  db: {
    from: (table: string) => fakeDb.from(table),
    storage: fakeStorage,
    auth: fakeAuth.service,
  },
  authClient: { auth: fakeAuth.anon },
};

export function resetFakeSupabase(): void {
  fakeDb.reset();
  fakeStorage.files.clear();
  fakeAuth.reset();
}
