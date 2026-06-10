import { JobPriority, JobStatus } from '../common/enums';
import { AGING_THRESHOLD_SECONDS } from '../common/config';

/** Minimal job representation required by both scheduling algorithms. */
export interface QueueJob {
  id: string;
  /** Pre-computed priority after aging; lower = more urgent (1 = HIGH). */
  effectivePriority: number;
  scheduledAt: Date;
  createdAt: Date;
}

/**
 * Comparator for the min-heap and timing-wheel slot ordering.
 * Primary key: effectivePriority ascending (1 = High runs first).
 * Secondary key: scheduledAt ascending (FIFO within the same priority).
 */
export function compareJobs(a: QueueJob, b: QueueJob): number {
  if (a.effectivePriority !== b.effectivePriority) {
    return a.effectivePriority - b.effectivePriority;
  }
  return a.scheduledAt.getTime() - b.scheduledAt.getTime();
}

/**
 * Starvation prevention via priority aging.
 *
 * A LOW-priority job that has been waiting for AGING_THRESHOLD_SECONDS
 * gets its effective priority boosted by one level. After 2× the threshold
 * it reaches HIGH and is guaranteed to run next, preventing indefinite
 * starvation behind a flood of higher-priority work.
 */
export function computeEffectivePriority(
  basePriority: JobPriority,
  createdAt: Date,
  now: Date = new Date(),
): number {
  const waitSeconds = (now.getTime() - createdAt.getTime()) / 1000;
  const boost = Math.floor(waitSeconds / AGING_THRESHOLD_SECONDS);
  return Math.max(JobPriority.HIGH, basePriority - boost);
}

export type JobRow = {
  id: string;
  effective_priority: number;
  scheduled_at: Date;
  created_at: Date;
  status: JobStatus;
};

export function jobRowToQueueEntry(row: JobRow): QueueJob {
  return {
    id: row.id,
    effectivePriority: row.effective_priority,
    scheduledAt: new Date(row.scheduled_at),
    createdAt: new Date(row.created_at),
  };
}
