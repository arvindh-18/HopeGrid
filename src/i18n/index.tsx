// src/i18n/index.tsx — language for the victim-facing screens (features.md F25): English, Tamil, Hindi.
// The choice is per device (localStorage, falls back to the browser language). Staff screens stay English:
// Layout wraps admin/volunteer pages in <EnglishOnly>.
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { IncidentType, MarkerColor, Need, PriorityLevel, PublicStatus, VictimStep } from '../../shared/types';
import { en, type Key } from './en';
import { hi } from './hi';
import { ta } from './ta';

export type Lang = 'en' | 'ta' | 'hi';
export type { Key };

export const LANGS: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'hi', name: 'हिन्दी' },
];
const DICTS: Record<Lang, Record<Key, string>> = { en, ta, hi };
const STORAGE_KEY = 'hopegrid.lang';

// Server log lines and error messages arrive in English; translate the ones we know, keep anything else as-is.
const SERVER_TEXT = new Map<string, Key>(
  (Object.keys(en) as Key[]).filter((k) => k.startsWith('log.') || k.startsWith('err.')).map((k) => [en[k], k]),
);

type Vars = Record<string, string | number>;
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

export interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Vars) => string;
  /** Like t, but {name} can be filled with elements (links, bold numbers). */
  rich: (key: Key, parts: Record<string, ReactNode>) => ReactNode;
  /** Translates a known English server message; unknown text is returned unchanged. */
  server: (text: string) => string;
  ago: (iso: string) => string;
  type: (t: IncidentType) => string;
  need: (n: Need) => string;
  step: (s: Exclude<VictimStep, 'CLOSED'>) => string;
  publicStatus: (s: PublicStatus) => string;
  priority: (p: PriorityLevel) => string;
  legend: (c: MarkerColor) => string;
  advice: (type: IncidentType, status: PublicStatus) => string;
}

function make(lang: Lang, setLang: (l: Lang) => void): I18n {
  const dict = DICTS[lang];
  const t = (key: Key, vars?: Vars) => fill(dict[key] ?? en[key], vars);
  return {
    lang,
    setLang,
    t,
    rich: (key, parts) =>
      dict[key].split(/\{(\w+)\}/).map((piece, i) => <Fragment key={i}>{i % 2 ? parts[piece] ?? `{${piece}}` : piece}</Fragment>),
    server: (text) => {
      const key = SERVER_TEXT.get(text);
      return key ? t(key) : text;
    },
    ago: (iso) => {
      const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (s < 45) return t('common.justNow');
      const m = Math.round(s / 60);
      if (m < 60) return t('common.minAgo', { n: m });
      const h = Math.round(m / 60);
      if (h < 24) return t('common.hAgo', { n: h });
      return new Date(iso).toLocaleDateString(lang === 'en' ? undefined : `${lang}-IN`);
    },
    type: (x) => t(`type.${x}` as Key),
    need: (x) => t(`need.${x}` as Key),
    step: (x) => t(`step.${x}` as Key),
    publicStatus: (x) => t(`pstatus.${x}` as Key),
    priority: (x) => t(`priority.${x}` as Key),
    legend: (x) => t(`legend.${x}` as Key),
    advice: (type, status) => {
      if (status === 'RESOLVED') return t('advice.resolved');
      const base = t(`advice.${type}` as Key);
      return status === 'RESPONDING' ? `${base} ${t('advice.responding')}` : base;
    },
  };
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ta' || saved === 'hi') return saved;
  } catch { /* storage blocked: fall through */ }
  const browser = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
  return browser.startsWith('ta') ? 'ta' : browser.startsWith('hi') ? 'hi' : 'en';
}

const Ctx = createContext<I18n>(make('en', () => {}));

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* not remembered, still switches */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => make(lang, setLang), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Staff screens: everything inside renders in English whatever the device language is. */
export function EnglishOnly({ children }: { children: ReactNode }) {
  const { setLang } = useContext(Ctx);
  const value = useMemo(() => make('en', setLang), [setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export function LanguagePicker({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select aria-label={t('lang.label')} value={lang} onChange={(e) => setLang(e.target.value as Lang)} className={className}>
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
    </select>
  );
}
