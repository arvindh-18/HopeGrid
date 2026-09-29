// src/components/ReasonList.tsx — renders Reason[] ("+20  2 independent reports") for explainable scores.
import type { Reason } from '../../shared/types';

export function ReasonList({ reasons, empty = 'No signals yet.' }: { reasons: Reason[]; empty?: string }) {
  if (reasons.length === 0) return <p className="t-body-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {reasons.map((r, i) => (
        <li key={i} className="grid grid-cols-[48px_1fr] items-baseline gap-2 border-b border-strong py-2 last:border-0">
          <span className={`text-right tabular-nums text-[14px] ${r.points > 0 ? 'font-medium text-ink' : 'text-muted'}`}>
            {r.points > 0 ? `+${r.points}` : '—'}
          </span>
          <span className="t-body-sm">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}
