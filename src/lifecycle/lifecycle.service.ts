import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { Job } from '../entities/job.entity';
import { JobLog } from '../entities/job-log.entity';
import { DlqAlertState } from '../entities/dlq-alert-state.entity';
import { JobStatus, JobInterval, LogEvent, INTERVAL_MS, REDIS_CHANNEL } from '../common/enums';
import {
  MAX_RETRIES, BACKOFF_BASE_SECONDS, BACKOFF_JITTER_RATIO,
  DLQ_ALERT_THRESHOLD, STALE_LOCK_MS, DISPATCH_CANDIDATE_LIMIT,
} from '../common/config';
import { assertTransition, JobCancelledError } from '../common/transitions';
import { RedisService } from '../redis/redis.service';
import { JobRow, jobRowToQueueEntry, QueueJob } from '../scheduler/types';

/**
 * TypeORM's dataSource.query() returns the raw pg QueryResult.
 * For UPDATE … RETURNING, pg gives back an array of rows directly,
 * but some TypeORM versions wrap it as [rows, affectedCount]. This helper
 * handles both shapes so callers don't need to worry about the version.
 */
function returningRows<T>(result: unknown): T[] {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length === 2 && typeof result[1] === 'number' && Array.isArray(result[0])) {
      return result[0] as T[];
    }
    return result as T[];
  }
  return [];
}

function computeBackoffMs(attempt: number): number {
  const baseMs = Math.pow(BACKOFF_BASE_SECONDS, attempt - 1) * 1000;
  const jitter = baseMs * BACKOFF_JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(baseMs + jitter));
}

@Injectable()
export class JobLifecycleService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    @InjectPinoLogger(JobLifecycleService.name) private readonly logger: PinoLogger,
  ) {}

  /** Emit a log event: persists to DB and publishes to Redis for SSE fan-out. */
  async emit(
    event: LogEvent,
    jobId: string,
    status: JobStatus | null,
    context: Record<string, unknown> = {},
  ): Promise<void> {
    this.logger.info({ event, jobId, status, ...context });
    await this.dataSource.getRepository(JobLog).insert({ jobId, event, status, context: context as never });
    await this.redis.publish(REDIS_CHANNEL, { event, jobId, status, ...context });
  }

  /** Strict status transition with optimistic locking. */
  async transition(
    jobId: string,
    to: JobStatus,
    patch: Partial<Job> = {},
  ): Promise<Job | null> {
    return this.dataSource.transaction(async (manager) => {
      const job = await manager.findOne(Job, {
        where: { id: jobId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) return null;
      assertTransition(job.status, to);
      const updated = manager.merge(Job, job, patch, { status: to, updatedAt: new Date() });
      return manager.save(Job, updated);
    });
  }

  /**
   * Atomically claim a specific job for this worker.
   *
   * The subquery + FOR UPDATE SKIP LOCKED ensures that if two workers race
   * on the same job, exactly one succeeds and the other gets NULL back —
   * no blocking, no duplicate processing.
   */
  async claimJob(jobId: string, workerId: string): Promise<Job | null> {
    const now = new Date();
    const raw = await this.dataSource.query(
      `UPDATE jobs
       SET status=$1, worker_id=$2, locked_at=$3,
           started_at=COALESCE(started_at,$3), updated_at=$3
       WHERE id=(
         SELECT id FROM jobs
         WHERE id=$4 AND status=$5 AND scheduled_at<=$3 AND in_dlq=false
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [JobStatus.PROCESSING, workerId, now, jobId, JobStatus.PENDING],
    );
    return returningRows<Job>(raw)[0] ?? null;
  }

  /**
   * Reset stale locks — jobs that have been processing too long are returned to PENDING.
   * Protects against worker crashes.
   */
  async resetStaleLocks(): Promise<number> {
    const staleThreshold = new Date(Date.now() - STALE_LOCK_MS);
    const raw = await this.dataSource.query(
      `UPDATE jobs
       SET status=$1, worker_id=NULL, locked_at=NULL, updated_at=NOW()
       WHERE status=$2 AND locked_at < $3
       RETURNING id`,
      [JobStatus.PENDING, JobStatus.PROCESSING, staleThreshold],
    );
    const rows = returningRows<{ id: string }>(raw);
    if (rows.length > 0) {
      this.logger.warn({ count: rows.length }, 'Reset stale locks');
    }
    return rows.length;
  }

  /** Check if cancel has been requested (cooperative cancellation). */
  async isCancelled(jobId: string): Promise<boolean> {
    const row = await this.dataSource
      .getRepository(Job)
      .findOne({ where: { id: jobId }, select: { cancelRequested: true } });
    return row?.cancelRequested ?? false;
  }

  /**
   * Complete a cooperative cancel: transition the in-flight job to CANCELLED.
   * Called by the worker after it detects the cancelRequested flag mid-run.
   */
  async markCancelled(job: Job): Promise<void> {
    await this.transition(job.id, JobStatus.CANCELLED, {
      workerId: null,
      lockedAt: null,
    });
    await this.emit(LogEvent.JOB_CANCELLED, job.id, JobStatus.CANCELLED, { workerId: job.workerId });
  }

  /** Cancel a pending job immediately, or signal a running job for cooperative cancel. */
  async cancel(jobId: string): Promise<{ ok: boolean; message: string }> {
    const job = await this.dataSource.getRepository(Job).findOne({ where: { id: jobId } });
    if (!job) return { ok: false, message: 'Not found' };

    if (job.status === JobStatus.PENDING) {
      await this.transition(jobId, JobStatus.CANCELLED);
      await this.emit(LogEvent.JOB_CANCELLED, jobId, JobStatus.CANCELLED);
      return { ok: true, message: 'Cancelled' };
    }
    if (job.status === JobStatus.PROCESSING) {
      await this.dataSource.getRepository(Job).update(jobId, { cancelRequested: true });
      return { ok: true, message: 'Cancel signal sent' };
    }
    return { ok: false, message: `Cannot cancel job in status '${job.status}'` };
  }

  /** Mark job completed; schedules next occurrence if recurring. */
  async complete(job: Job): Promise<void> {
    await this.transition(job.id, JobStatus.COMPLETED, { workerId: null, lockedAt: null });
    await this.emit(LogEvent.JOB_COMPLETED, job.id, JobStatus.COMPLETED, {
      durationMs: job.startedAt ? Date.now() - job.startedAt.getTime() : null,
    });

    if (job.interval) {
      const delay = INTERVAL_MS[job.interval as JobInterval] ?? 60_000;
      const scheduledAt = new Date(Date.now() + delay);
      const next = this.dataSource.getRepository(Job).create({
        type: job.type,
        payload: job.payload,
        priority: job.priority,
        effectivePriority: job.priority,
        interval: job.interval,
        parentWorkflowId: job.parentWorkflowId,
        workflowKey: job.workflowKey,
        scheduledAt,
      });
      await this.dataSource.getRepository(Job).save(next);
      await this.emit(LogEvent.JOB_CREATED, next.id, JobStatus.PENDING, {
        recurring: true,
        parentId: job.id,
        scheduledAt,
      });
    }
  }

  /** Retry or dead-letter a failed job. */
  async handleFailure(job: Job, error: Error | JobCancelledError): Promise<void> {
    if (error instanceof JobCancelledError) {
      await this.markCancelled(job);
      return;
    }

    const newRetryCount = job.retryCount + 1;
    const maxRetries = job.maxRetries ?? MAX_RETRIES;

    if (newRetryCount <= maxRetries) {
      const delayMs = computeBackoffMs(newRetryCount);
      const scheduledAt = new Date(Date.now() + delayMs);
      await this.transition(job.id, JobStatus.PENDING, {
        retryCount: newRetryCount,
        errorMessage: error.message,
        workerId: null,
        lockedAt: null,
        scheduledAt,
      });
      await this.emit(LogEvent.JOB_RETRY, job.id, JobStatus.PENDING, {
        attempt: newRetryCount,
        delayMs,
        error: error.message,
      });
    } else {
      await this.transition(job.id, JobStatus.FAILED, {
        inDlq: true,
        errorMessage: error.message,
        workerId: null,
        lockedAt: null,
      });
      await this.emit(LogEvent.DEAD_LETTERED, job.id, JobStatus.FAILED, { error: error.message });
    }
  }

  /** Manually retry a job from the DLQ. */
  async retryFromDlq(jobId: string): Promise<Job | null> {
    const raw = await this.dataSource.query(
      `UPDATE jobs
       SET status=$1, in_dlq=false, retry_count=0,
           error_message=NULL, scheduled_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND in_dlq=true
       RETURNING *`,
      [JobStatus.PENDING, jobId],
    );
    const job = returningRows<Job>(raw)[0];
    if (job) {
      await this.emit(LogEvent.JOB_CREATED, job.id, JobStatus.PENDING, { retriedFromDlq: true });
    }
    return job ?? null;
  }

  /**
   * Emit a DLQ alert when the dead-letter count crosses DLQ_ALERT_THRESHOLD.
   * Hysteresis: the alert fires only when crossing the threshold from below,
   * preventing repeated alerts on every tick while the queue stays full.
   * The count must drop below the threshold before the next alert can fire.
   */
  async checkDlqAlert(): Promise<void> {
    const [{ count }] = (await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM jobs WHERE in_dlq=true`,
    )) as [{ count: string }];
    const dlqCount = Number(count);

    let state = await this.dataSource
      .getRepository(DlqAlertState)
      .findOne({ where: { id: 1 } });
    if (!state) {
      state = this.dataSource.getRepository(DlqAlertState).create({ id: 1, lastDlqCount: 0 });
    }

    const prev = state.lastDlqCount ?? 0;
    if (dlqCount >= DLQ_ALERT_THRESHOLD && prev < DLQ_ALERT_THRESHOLD) {
      this.logger.warn({ dlqCount }, 'DLQ alert threshold exceeded');
      state.lastAlertAt = new Date();
      await this.emit(LogEvent.DLQ_ALERT_SENT, 'system', null, {
        dlqCount,
        threshold: DLQ_ALERT_THRESHOLD,
      });
    }
    state.lastDlqCount = dlqCount;
    await this.dataSource.getRepository(DlqAlertState).save(state);
  }

  /** Load ready candidates, ordered by effective_priority then scheduled_at. */
  async getDispatchCandidates(): Promise<QueueJob[]> {
    const rows = await this.dataSource.query(
      `SELECT id, effective_priority, scheduled_at, created_at, status
       FROM jobs
       WHERE status=$1 AND scheduled_at<=NOW() AND in_dlq=false
       ORDER BY effective_priority ASC, scheduled_at ASC
       LIMIT $2`,
      [JobStatus.PENDING, DISPATCH_CANDIDATE_LIMIT],
    ) as JobRow[];
    return rows.map(jobRowToQueueEntry);
  }

  /** Check that all upstream dependencies of a job are completed. */
  async dependenciesMet(jobId: string): Promise<boolean> {
    const [{ unmet }] = (await this.dataSource.query(
      `SELECT COUNT(*) AS unmet
       FROM job_dependencies jd
       JOIN jobs j ON j.id = jd.depends_on_job_id
       WHERE jd.job_id=$1 AND j.status <> $2`,
      [jobId, JobStatus.COMPLETED],
    )) as [{ unmet: string }];
    return Number(unmet) === 0;
  }

  /** Get a job by id. */
  async getJob(jobId: string): Promise<Job | null> {
    return this.dataSource.getRepository(Job).findOne({ where: { id: jobId } });
  }

  /** Get job event timeline. */
  async getLogs(jobId: string): Promise<JobLog[]> {
    return this.dataSource
      .getRepository(JobLog)
      .find({ where: { jobId }, order: { createdAt: 'ASC' } });
  }
}
