// S11 Resources — relief supplies list with add and inline edit (features.md F21).
import { useState } from 'react';
import { POLL_RESOURCES_MS } from '../../../shared/constants';
import { ApiError, RESOURCE_CATEGORIES, type Resource, type ResourceCategory, type ResourceInput } from '../../../shared/types';
import { Tag } from '../../components/Badges';
import { IconEdit, IconPlus } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { Button, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, useToast } from '../../components/ui';
import { api } from '../../data';
import { usePoll } from '../../hooks/usePoll';
import { CATEGORY_LABEL } from '../../lib/labels';

export default function Resources() {
  const toast = useToast();
  const q = usePoll(() => api.listResources(), POLL_RESOURCES_MS);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function saveEdit(r: Resource, patch: Partial<ResourceInput>) {
    try {
      const updated = await api.updateResource(r.id, patch);
      q.setData((q.data ?? []).map((x) => (x.id === r.id ? updated : x)));
      setEditing(null);
      toast('Resource updated');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'error');
    }
  }

  return (
    <Layout variant="admin" width="wide">
      <PageHeader
        title="Relief supplies"
        subtitle="What you have and where it is. Allocate supplies from an incident page."
        actions={<Button onClick={() => setAdding(true)}><IconPlus size={18} /> Add resource</Button>}
      />
      {q.loading ? (
        <LoadingBlock rows={4} />
      ) : !q.data ? (
        <ErrorState message={q.error?.message ?? 'Could not load resources.'} onRetry={q.refresh} />
      ) : q.data.length === 0 ? (
        <EmptyState title="No resources yet" body="Add water, food, medicine or shelter space so you can allocate it to incidents." action={<Button onClick={() => setAdding(true)}>Add resource</Button>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="border-b border-strong text-muted">
              <tr>
                <th className="px-5 py-3 font-normal">Name</th>
                <th className="px-3 py-3 font-normal">Category</th>
                <th className="px-3 py-3 font-normal">Available</th>
                <th className="px-3 py-3 font-normal">Location</th>
                <th className="px-5 py-3 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) =>
                editing === r.id ? (
                  <EditRow key={r.id} r={r} onCancel={() => setEditing(null)} onSave={(p) => saveEdit(r, p)} />
                ) : (
                  <tr key={r.id} className="border-b border-strong last:border-0">
                    <td className="px-5 py-3.5 font-medium text-ink">{r.name}</td>
                    <td className="px-3 py-3.5"><Tag>{CATEGORY_LABEL[r.category]}</Tag></td>
                    <td className={`px-3 py-3.5 tabular-nums ${r.quantity === 0 ? 'text-danger' : ''}`}>{r.quantity} {r.unit}{r.quantity === 0 && ' (none left)'}</td>
                    <td className="px-3 py-3.5">{r.locationText}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r.id)} aria-label={`Edit ${r.name}`}><IconEdit size={16} /> Edit</Button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <AddResourceModal
          onClose={() => setAdding(false)}
          onCreated={(r) => { q.setData([...(q.data ?? []), r]); setAdding(false); toast('Resource added'); }}
        />
      )}
    </Layout>
  );
}

function EditRow({ r, onSave, onCancel }: { r: Resource; onSave: (p: Partial<ResourceInput>) => void; onCancel: () => void }) {
  const [qty, setQty] = useState(String(r.quantity));
  const [loc, setLoc] = useState(r.locationText);
  const n = Number(qty);
  const bad = !Number.isInteger(n) || n < 0;
  return (
    <tr className="border-b border-strong bg-[#fafafa] last:border-0">
      <td className="px-5 py-3 font-medium text-ink">{r.name}</td>
      <td className="px-3 py-3"><Tag>{CATEGORY_LABEL[r.category]}</Tag></td>
      <td className="px-3 py-3">
        <label className="sr-only" htmlFor={`q-${r.id}`}>Quantity</label>
        <input id={`q-${r.id}`} className="input !min-h-[38px] max-w-[110px]" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={bad} />
      </td>
      <td className="px-3 py-3">
        <label className="sr-only" htmlFor={`l-${r.id}`}>Location</label>
        <input id={`l-${r.id}`} className="input !min-h-[38px]" value={loc} onChange={(e) => setLoc(e.target.value)} />
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={bad || !loc.trim()} onClick={() => onSave({ quantity: n, locationText: loc.trim() })}>Save</Button>
      </td>
    </tr>
  );
}

function AddResourceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: Resource) => void }) {
  const [f, setF] = useState<ResourceInput>({ name: '', category: 'WATER', quantity: 0, unit: '', locationText: '' });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errs = {
    name: !f.name.trim() ? 'Give the resource a name.' : null,
    quantity: !Number.isInteger(f.quantity) || f.quantity < 0 ? 'Quantity must be 0 or more.' : null,
    unit: !f.unit.trim() ? 'Add a unit, e.g. bottles.' : null,
    locationText: !f.locationText.trim() ? 'Say where it is stored.' : null,
  };
  const valid = Object.values(errs).every((e) => !e);

  async function submit() {
    setTried(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createResource({ ...f, name: f.name.trim(), unit: f.unit.trim(), locationText: f.locationText.trim() }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add the resource.');
      setBusy(false);
    }
  }

  return (
    <Modal open title="Add resource" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={submit}>Add resource</Button>
    </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" htmlFor="r-name" error={tried ? errs.name : null}>
            <input id="r-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Drinking water" />
          </Field>
        </div>
        <Field label="Category" htmlFor="r-cat">
          <select id="r-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ResourceCategory })}>
            {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="r-qty" error={tried ? errs.quantity : null}>
            <input id="r-qty" className="input" type="number" min={0} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} />
          </Field>
          <Field label="Unit" htmlFor="r-unit" error={tried ? errs.unit : null}>
            <input id="r-unit" className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="bottles" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Stored at" htmlFor="r-loc" error={tried ? errs.locationText : null}>
            <input id="r-loc" className="input" value={f.locationText} onChange={(e) => setF({ ...f, locationText: e.target.value })} placeholder="e.g. Community Center" />
          </Field>
        </div>
      </div>
      {error && <p className="mt-3 text-[14px] text-danger" role="alert">{error}</p>}
    </Modal>
  );
}
