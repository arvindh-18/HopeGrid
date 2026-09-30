// src/components/Layout.tsx — header, role navigation, offline banner, emergency banner, demo menu.
// Public pages follow the chosen language (F25); admin and volunteer pages are always English.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { EMERGENCY_NUMBER, api } from '../data';
import { homeFor, useAuth } from '../hooks/useAuth';
import { EnglishOnly, LanguagePicker, useI18n, type Key } from '../i18n';
import { isForcedOffline, setForcedOffline, useOnline } from '../offline/useOnline';
import { IconClose, IconFlask, IconMenu, IconPhone, IconWifiOff } from './Icons';
import { Toggle, useToast } from './ui';

type Variant = 'public' | 'admin' | 'volunteer';

interface LayoutProps {
  variant?: Variant;
  /** S01–S04 show the emergency number (AR-26). */
  emergency?: boolean;
  /** Narrow single column (victim/volunteer) or wide workspace (admin). */
  width?: 'narrow' | 'wide';
  children: ReactNode;
}

const PUBLIC_NAV: { to: string; label: Key }[] = [
  { to: '/report', label: 'nav.report' },
  { to: '/track', label: 'nav.track' },
  { to: '/map', label: 'nav.map' },
];
const NAV: Record<Exclude<Variant, 'public'>, { to: string; label: string; end?: boolean }[]> = {
  admin: [
    { to: '/admin', label: 'Incidents', end: true },
    { to: '/admin/resources', label: 'Resources' },
    { to: '/admin/volunteers', label: 'Volunteers' },
    { to: '/map', label: 'Public map' },
  ],
  volunteer: [
    { to: '/volunteer', label: 'My assignments', end: true },
    { to: '/map', label: 'Safety map' },
  ],
};

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-white no-underline" aria-label="HopeGrid home">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden>
        <path d="M32 12 52 48H12Z" fill="none" stroke="#c7eb08" strokeWidth="6" strokeLinejoin="round" />
        <path d="M32 27v8" stroke="#c7eb08" strokeWidth="6" strokeLinecap="round" />
        <circle cx="32" cy="42" r="3.2" fill="#c7eb08" />
      </svg>
      <span className="font-display text-[17px] tracking-[-0.2px]">HopeGrid</span>
    </Link>
  );
}

export function Layout(props: LayoutProps) {
  return props.variant && props.variant !== 'public' ? <EnglishOnly><LayoutInner {...props} /></EnglishOnly> : <LayoutInner {...props} />;
}

function LayoutInner({ variant = 'public', emergency, width = 'narrow', children }: LayoutProps) {
  const online = useOnline();
  const { t, rich } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const links: { to: string; label: string; end?: boolean }[] =
    variant === 'public' ? PUBLIC_NAV.map((l) => ({ ...l, label: t(l.label) })) : NAV[variant];
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-2 text-[15px] no-underline transition-colors ${isActive ? 'bg-white/12 text-white' : 'text-white/75 hover:text-white'}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-[1000] bg-dark text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className={`mx-auto flex h-16 items-center gap-4 px-4 sm:px-6 ${width === 'wide' ? 'max-w-[1440px]' : 'max-w-5xl'}`}>
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>{l.label}</NavLink>)}
          </nav>
          {variant === 'public' && (
            <LanguagePicker className="ml-auto rounded-full border border-white/25 bg-dark px-3 py-1.5 text-[14px] text-white" />
          )}
          <div className={`${variant === 'public' ? 'ml-3' : 'ml-auto'} hidden items-center gap-3 md:flex`}>
            {user ? (
              <>
                {variant === 'public' && <Link to={homeFor(user)} className="text-[14px] text-white/75 no-underline hover:text-white">My workspace</Link>}
                <span className="text-[14px] text-white/75">{user.name}</span>
                <button type="button" onClick={() => { logout(); navigate('/'); }} className="rounded-full bg-white px-4 py-2 text-[14px] font-medium text-ink">Log out</button>
              </>
            ) : (
              variant === 'public' && <Link to="/login" className="rounded-full bg-white/10 px-4 py-2 text-[14px] text-white no-underline hover:bg-white/20">{t('nav.staffLogin')}</Link>
            )}
          </div>
          <button type="button" className={`${variant === 'public' ? 'ml-1' : 'ml-auto'} grid h-10 w-10 place-items-center rounded-full hover:bg-white/10 md:hidden`} aria-expanded={menuOpen} aria-label={t('nav.menu')} onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-white/10 px-4 pb-4 pt-2 md:hidden" aria-label="Main">
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>{l.label}</NavLink>)}
            {user ? (
              <button type="button" onClick={() => { logout(); navigate('/'); }} className="mt-2 self-start rounded-full bg-white px-4 py-2 text-[14px] font-medium text-ink">Log out {user.name}</button>
            ) : (
              <NavLink to="/login" className={linkCls}>{t('nav.staffLogin')}</NavLink>
            )}
          </nav>
        )}
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-[#fbf2cf] px-4 py-2 text-[14px] text-[#5c4600]" role="status">
            <IconWifiOff size={18} />
            <span>{variant === 'public' ? t('offline.public') : "You're offline. Showing the last information we had."}</span>
          </div>
        )}
      </header>

      {emergency && (
        <div className="bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 text-[14px] sm:px-6">
            <IconPhone size={18} className="text-danger" />
            <span>{rich('emergency.call', { n: <a href={`tel:${EMERGENCY_NUMBER}`} className="font-medium text-danger">{EMERGENCY_NUMBER}</a> })}</span>
          </div>
        </div>
      )}

      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 ${width === 'wide' ? 'max-w-[1440px]' : 'max-w-5xl'}`}>{children}</main>
      <DemoMenu />
    </div>
  );
}

// ---------- Demo menu (DEV builds only) — features.md F23 ----------
function DemoMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(isForcedOffline());
  const navigate = useNavigate();
  const toast = useToast();
  if (!import.meta.env.DEV) return null;

  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true);
    try { await fn(); toast(done); setOpen(false); } catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="fixed right-3 top-[76px] z-[1200] flex flex-col-reverse items-end gap-2 sm:bottom-4 sm:left-4 sm:right-auto sm:top-auto sm:flex-col sm:items-start">
      {open && (
        <div className="w-72 rounded-[16px] bg-white p-4 shadow-[var(--shadow-overlay)]">
          <p className="t-title-sm mb-1">Demo</p>
          <p className="t-caption mb-3">Development build.</p>
          <div className="flex flex-col gap-2">
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(async () => { await api.resetDemo(); navigate('/'); }, 'Demo data reset')}>Reset demo data</button>
            <label className="mt-1 flex items-center justify-between gap-3 text-[14px]">Simulate offline <Toggle label="Simulate offline" checked={offline} onChange={(v) => { setForcedOffline(v); setOffline(v); }} /></label>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full bg-lime px-3.5 py-2 sm:px-4 sm:py-2.5 text-[14px] font-medium text-ink shadow-[var(--shadow-float)]" aria-expanded={open}>
        <IconFlask size={18} /> Demo
      </button>
    </div>
  );
}
