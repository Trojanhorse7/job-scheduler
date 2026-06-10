export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum JobPriority {
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

export enum JobInterval {
  EVERY_1_MINUTE = 'every_1_minute',
  EVERY_5_MINUTES = 'every_5_minutes',
  EVERY_1_HOUR = 'every_1_hour',
}

export enum LogEvent {
  JOB_CREATED = 'job.created',
  JOB_STARTED = 'job.started',
  JOB_RETRY = 'job.retry',
  JOB_FAILED = 'job.failed',
  JOB_CANCELLED = 'job.cancelled',
  JOB_COMPLETED = 'job.completed',
  DLQ_ALERT_SENT = 'dlq.alert_sent',
  DEAD_LETTERED = 'job.dead_lettered',
  JOB_BLOCKED = 'job.blocked',
}

export const INTERVAL_MS: Record<JobInterval, number> = {
  [JobInterval.EVERY_1_MINUTE]: 60_000,
  [JobInterval.EVERY_5_MINUTES]: 300_000,
  [JobInterval.EVERY_1_HOUR]: 3_600_000,
};

export const REDIS_CHANNEL = 'job:updates';
