// S01 Home — one-tap entry into reporting (features.md §3).
import { Link } from 'react-router-dom';
import { IconArrowRight, IconMap, IconPin } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Notice } from '../components/ui';
import { useI18n } from '../i18n';
import { useOutbox } from '../offline/outbox';

export default function Home() {
  const outbox = useOutbox();
  const { t, rich, ago } = useI18n();
  const unsent = outbox?.filter((i) => i.status !== 'SENT') ?? [];
  const recent = [...(outbox ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);

  return (
    <Layout emergency>
      <div className="grid gap-10 py-2 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:py-10">
        <section aria-labelledby="hero-title">
          <h1 id="hero-title" className="t-display max-w-[14ch]">{t('home.title')}</h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-body">
            {t('home.lede')}
          </p>
          <Link
            to="/report"
            className="mt-8 flex min-h-[76px] w-full max-w-md items-center justify-between gap-4 rounded-full bg-danger py-4 pl-8 pr-4 text-white no-underline shadow-[0_10px_30px_rgba(193,53,21,0.28)] transition-colors hover:bg-danger-dark sm:min-h-[84px]"
          >
            <span className="font-display text-[22px] font-medium tracking-[-0.3px] sm:text-[24px]">{t('home.cta')}</span>
            <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-white text-danger"><IconArrowRight size={24} /></span>
          </Link>
          {unsent.length > 0 && (
            <div className="mt-5 max-w-md">
              <Notice tone="warning" action={<Link to={`/report/sent/${unsent[0].id}`} className="btn btn-outline btn-sm">{t('home.view')}</Link>}>
                {unsent.length === 1 ? t('home.unsentOne') : t('home.unsentMany', { n: unsent.length })}
              </Notice>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-label={t('home.otherOptions')}>
          <Link to="/track" className="card card-pad flex items-center gap-4 text-body no-underline transition-colors hover:bg-[#fafafa]">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-canvas"><IconPin /></span>
            <span className="flex-1">
              <span className="t-title-sm block">{t('home.trackTitle')}</span>
              <span className="t-body-sm text-muted">{t('home.trackBody')}</span>
            </span>
            <IconArrowRight className="text-muted" />
          </Link>
          <Link to="/map" className="card card-pad flex items-center gap-4 text-body no-underline transition-colors hover:bg-[#fafafa]">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-canvas"><IconMap /></span>
            <span className="flex-1">
              <span className="t-title-sm block">{t('home.mapTitle')}</span>
              <span className="t-body-sm text-muted">{t('home.mapBody')}</span>
            </span>
            <IconArrowRight className="text-muted" />
          </Link>

          {recent.length > 0 && (
            <div className="card card-pad">
              <h2 className="t-title-sm">{t('home.recent')}</h2>
              <ul className="mt-3 flex flex-col">
                {recent.map((r) => (
                  <li key={r.id} className="border-b border-strong last:border-0">
                    <Link to={`/report/sent/${r.id}`} className="flex items-center justify-between gap-3 py-3 text-body no-underline">
                      <span>
                        <span className="font-medium tabular-nums tracking-[0.06em] text-ink">{r.submission.code}</span>
                        <span className="t-caption ml-2">{ago(r.createdAt)}</span>
                      </span>
                      <span className={`t-caption ${r.status === 'SENT' ? 'text-success' : r.status === 'FAILED' ? 'text-danger' : 'text-[#924400]'}`}>
                        {r.status === 'SENT' ? t('sync.sent') : r.status === 'FAILED' ? t('sync.notSent') : t('sync.waiting')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
      <p className="mt-12 t-caption">
        {rich('home.staff', { link: <Link to="/login" className="text-ink">{t('nav.staffLogin')}</Link> })}
        <br />
        {rich('home.volunteer', { link: <Link to="/volunteer/register" className="text-ink">{t('home.volunteerLink')}</Link> })}
      </p>
    </Layout>
  );
}
