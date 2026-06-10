import { JobStatus } from './enums';

/**
 * Finite-state machine for job status.
 *
 * Allowed transitions (→ means "can move to"):
 *   PENDING     → PROCESSING  (worker claims the job)
 *   PENDING     → CANCELLED   (API cancel before pickup)
 *   PROCESSING  → COMPLETED   (handler finished successfully)
 *   PROCESSING  → PENDING     (retry scheduled — transient failure)
 *   PROCESSING  → FAILED      (retries exhausted → DLQ)
 *   PROCESSING  → CANCELLED   (cooperative cancel signal honoured)
 *   FAILED      → PENDING     (operator manually retries from DLQ)
 *
 * COMPLETED and CANCELLED are terminal — no further transitions allowed.
 */
export const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.PENDING]: [JobStatus.PROCESSING, JobStatus.CANCELLED],
  [JobStatus.PROCESSING]: [
    JobStatus.COMPLETED,
    JobStatus.PENDING,   // transient retry
    JobStatus.FAILED,    // terminal — exhausted retries
    JobStatus.CANCELLED, // cooperative cancel
  ],
  [JobStatus.COMPLETED]: [],
  [JobStatus.FAILED]: [JobStatus.PENDING], // manual DLQ retry
  [JobStatus.CANCELLED]: [],
};

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid job transition: ${from} → ${to}`);
  }
}

export class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = 'JobCancelledError';
  }
}
