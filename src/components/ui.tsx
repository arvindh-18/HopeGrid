// src/components/ui.tsx — reusable UI primitives (buttons, fields, states, toast).
// Presentational only: no data access (AR-12).
import { createContext, useCallback, useContext, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { IconAlert, IconCheck, IconClose, IconRefresh } from './Icons';

// ---------- Button ----------
type Variant = 'primary' | 'lime' | 'danger' | 'outline' | 'ghost';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  busy?: boolean;
}
export function Button({ variant = 'primary', size = 'md', block, busy, className = '', children, disabled, ...rest }: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' ? `btn-${size}` : '', block ? 'btn-block' : '', className].join(' ');
  return (
    <button className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && <Spinner size={16} />}
      {children}
    </button>
  );
}

// ---------- Field ----------
export function Field({
  label, hint, error, optional, children, htmlFor,
}: { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; children: ReactNode; htmlFor?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[15px] text-ink">
        {label}
        {optional && <span className="text-muted"> ({t('common.optional')})</span>}
      </label>
      {children}
      {hint && !error && <p className="t-caption">{hint}</p>}
      {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function useFieldId(): string {
  return useId();
}

// ---------- Toggle ----------
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-[52px] flex-none items-center rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-lime' : 'bg-strong'}`}
    >
      <span className={`absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : ''}`} />
    </button>
  );
}

// ---------- Spinner / skeleton ----------
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      role="status" aria-label="Loading"
      style={{ width: size, height: size, borderWidth: Math.max(2, size / 9), animation: 'spin 0.8s linear infinite' }}
      className="inline-block flex-none rounded-full border-current border-r-transparent"
    />
  );
}
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  );
}

// ---------- Empty / error / notices ----------
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[16px] border border-dashed border-hairline px-6 py-8">
      <p className="t-title-sm">{title}</p>
      {body && <p className="t-body-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t, server } = useI18n();
  return (
    <div className="flex flex-col items-start gap-3 rounded-[16px] bg-white px-6 py-6" role="alert">
      <div className="flex items-center gap-2 text-danger"><IconAlert /> <span className="font-medium">{t('common.couldNotLoad')}</span></div>
      <p className="t-body-sm text-muted">{server(message)}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><IconRefresh size={16} /> {t('common.tryAgain')}</Button>}
    </div>
  );
}

type NoticeTone = 'info' | 'warning' | 'danger' | 'success';
const NOTICE: Record<NoticeTone, string> = {
  info: 'bg-white text-body border-hairline',
  warning: 'bg-[#fbf2cf] text-[#5c4600] border-transparent',
  danger: 'bg-[#fbe7e2] text-[#8a240d] border-transparent',
  success: 'bg-[#e3eee3] text-success border-transparent',
};
export function Notice({ tone = 'info', children, action }: { tone?: NoticeTone; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border px-4 py-3 t-body-sm ${NOTICE[tone]}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** Small "Updated 5 s ago / showing older data" line under polled content. */
export function FreshnessLine({ lastUpdated, stale, onRefresh }: { lastUpdated: Date | null; stale: boolean; onRefresh?: () => void }) {
  const { t } = useI18n();
  return (
    <p className={`t-caption flex items-center gap-2 ${stale ? 'text-[#924400]' : ''}`}>
      {stale ? t('common.stale') : t('common.updated')}{' '}
      {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
      {onRefresh && (
        <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline">
          <IconRefresh size={14} /> {t('common.refresh')}
        </button>
      )}
    </p>
  );
}

// ---------- Toast ----------
interface ToastItem { id: number; text: string; tone: 'success' | 'error' | 'info' }
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[2000] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            style={{ animation: 'toast-in 0.25s var(--ease-brand)' }}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-full px-5 py-3 text-[14px] shadow-[var(--shadow-float)] ${t.tone === 'error' ? 'bg-danger text-white' : 'bg-dark text-white'}`}
          >
            {t.tone === 'error' ? <IconAlert size={18} /> : <IconCheck size={18} className={t.tone === 'success' ? 'text-lime' : ''} />}
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" className="opacity-70 hover:opacity-100" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <IconClose size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Layout helpers ----------
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-3">{back}</div>}
        <h1 className="t-title-lg">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card card-pad" aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="t-title-sm">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Relative time, e.g. "5 min ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
