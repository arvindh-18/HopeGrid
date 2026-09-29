// S01 Home — one-tap entry into reporting (features.md §3).
import { Link } from 'react-router-dom';
import { IconArrowRight, IconMap, IconPin } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Notice, timeAgo } from '../components/ui';
import { useOutbox } from '../offline/outbox';

export default function Home() {
  const outbox = useOutbox();
  const unsent = outbox?.filter((i) => i.status !== 'SENT') ?? [];
  const recent = [...(outbox ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);

  return (
    <Layout emergency>
      <div className="grid gap-10 py-2 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:py-10">
        <section aria-labelledby="hero-title">
          <h1 id="hero-title" className="t-display max-w-[14ch]">Need help? Tell us what's happening.</h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-body">
            Type it or say it. No account needed, and it works without internet — your report sends by itself when you're back online.
          </p>
          <Link
            to="/report"
            className="mt-8 flex min-h-[76px] w-full max-w-md items-center justify-between gap-4 rounded-full bg-danger py-4 pl-8 pr-4 text-white no-underline shadow-[0_10px_30px_rgba(193,53,21,0.28)] transition-colors hover:bg-danger-dark sm:min-h-[84px]"
          >
            <span className="font-display text-[22px] font-medium tracking-[-0.3px] sm:text-[24px]">Report an emergency</span>
            <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-white text-danger"><IconArrowRight size={24} /></span>
          </Link>
          {unsent.length > 0 && (
            <div className="mt-5 max-w-md">
              <Notice tone="warning" action={<Link to={`/report/sent/${unsent[0].id}`} className="btn btn-outline btn-sm">View</Link>}>
                You have {unsent.length} unsent {unsent.length === 1 ? 'report' : 'reports'}. {unsent.length === 1 ? 'It sends' : 'They send'} automatically when you're online.
              </Notice>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-label="Other options">
          <Link to="/track" className="card card-pad flex items-center gap-4 text-body no-underline transition-colors hover:bg-[#fafafa]">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-canvas"><IconPin /></span>
            <span className="flex-1">
              <span className="t-title-sm block">Track my report</span>
              <span className="t-body-sm text-muted">Use the code and PIN you received.</span>
            </span>
            <IconArrowRight className="text-muted" />
          </Link>
          <Link to="/map" className="card card-pad flex items-center gap-4 text-body no-underline transition-colors hover:bg-[#fafafa]">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-canvas"><IconMap /></span>
            <span className="flex-1">
              <span className="t-title-sm block">Safety map</span>
              <span className="t-body-sm text-muted">Flooded roads, fires and other hazards near you.</span>
            </span>
            <IconArrowRight className="text-muted" />
          </Link>

          {recent.length > 0 && (
            <div className="card card-pad">
              <h2 className="t-title-sm">Reports from this phone</h2>
              <ul className="mt-3 flex flex-col">
                {recent.map((r) => (
                  <li key={r.id} className="border-b border-strong last:border-0">
                    <Link to={`/report/sent/${r.id}`} className="flex items-center justify-between gap-3 py-3 text-body no-underline">
                      <span>
                        <span className="font-medium tabular-nums tracking-[0.06em] text-ink">{r.submission.code}</span>
                        <span className="t-caption ml-2">{timeAgo(r.createdAt)}</span>
                      </span>
                      <span className={`t-caption ${r.status === 'SENT' ? 'text-success' : r.status === 'FAILED' ? 'text-danger' : 'text-[#924400]'}`}>
                        {r.status === 'SENT' ? 'Sent' : r.status === 'FAILED' ? 'Not sent' : 'Waiting to send'}
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
        Coordinator or volunteer? <Link to="/login" className="text-ink">Staff login</Link>
      </p>
    </Layout>
  );
}
