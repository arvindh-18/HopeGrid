// src/components/Badges.tsx — priority, confidence, status and generic tone tags.
import type { ReactNode } from 'react';
import type { AssignmentStatus, ConfidenceBand, IncidentStatus, PriorityLevel } from '../../shared/types';
import {
  ASSIGNMENT_LABEL, BAND_LABEL, BAND_TONE, PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, type Tone,
} from '../lib/labels';

export function Tag({ tone = 'neutral', dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`tag tone-${tone}`} title={title}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function PriorityBadge({ level, overridden }: { level: PriorityLevel; overridden?: boolean }) {
  if (level === 'CRITICAL') {
    return <span className="tag tone-solid-critical"><span className="dot bg-white" />Critical{overridden ? ' (set by admin)' : ''}</span>;
  }
  return <Tag tone={PRIORITY_TONE[level]} dot>{PRIORITY_LABEL[level]}{overridden ? ' (set by admin)' : ''}</Tag>;
}

export function ConfidenceBadge({ score, band }: { score?: number; band: ConfidenceBand }) {
  return (
    <Tag tone={BAND_TONE[band]} title="How reliable the information is">
      {score !== undefined ? `Confidence ${score}% (${BAND_LABEL[band]})` : `Confidence: ${BAND_LABEL[band]}`}
    </Tag>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <Tag tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Tag>;
}

const ASG_TONE: Record<AssignmentStatus, Tone> = {
  ASSIGNED: 'info', ACCEPTED: 'lime', EN_ROUTE: 'lime', ON_SITE: 'lime', ASSISTING: 'lime', DONE: 'ok',
  DECLINED: 'neutral', UNABLE: 'high', CANCELLED: 'neutral',
};
export function AssignmentBadge({ status }: { status: AssignmentStatus }) {
  return <Tag tone={ASG_TONE[status]}>{ASSIGNMENT_LABEL[status]}</Tag>;
}
