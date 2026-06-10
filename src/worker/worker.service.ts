import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { JobLifecycleService } from '../lifecycle/lifecycle.service';
import { createSchedulerQueue } from '../scheduler/queue';
import { HandlerRegistry } from './handlers';
import { JobCancelledError } from '../common/transitions';
import { LogEvent } from '../common/enums';
import { DISPATCH_POLL_INTERVAL_MS, WORKER_CONCURRENCY } from '../common/config';
import { Job } from '../entities/job.entity';

/**
 * Core dispatch loop.
 *
 * On every tick (default 500 ms):
 *   1. Reset stale locks — jobs stuck in PROCESSING longer than STALE_LOCK_MS
 *      are returned to PENDING so another worker can pick them up.
 *   2. Check DLQ alert threshold (hysteresis prevents alert spam).
 *   3. Load up to DISPATCH_CANDIDATE_LIMIT PENDING candidates from Postgres.
 *   4. Feed them into the in-memory scheduler queue (heap or timing wheel).
 *   5. Pop jobs up to the remaining concurrency slots and claim each one with
 *      FOR UPDATE SKIP LOCKED — only one worker wins the race per job.
 *   6. Skip jobs whose DAG dependencies are not yet completed.
 *   7. Run the handler; on success → complete, on error → retry or DLQ.
 */
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly workerId = `worker-${randomUUID().slice(0, 8)}`;
  private timer?: NodeJS.Timeout;
  /** Tracks in-flight jobs to enforce WORKER_CONCURRENCY without a semaphore. */
  private inFlight = 0;

  constructor(
    private readonly lifecycle: JobLifecycleService,
    private readonly registry: HandlerRegistry,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(WorkerService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.logger.info({ workerId: this.workerId }, 'Worker started');
    this.timer = setInterval(() => void this.tick(), DISPATCH_POLL_INTERVAL_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.logger.info('Worker stopped');
  }

  private async tick(): Promise<void> {
    try {
      await this.lifecycle.resetStaleLocks();
      await this.lifecycle.checkDlqAlert();

      const candidates = await this.lifecycle.getDispatchCandidates();
      if (candidates.length === 0) return;

      const queue = createSchedulerQueue();
      for (const c of candidates) queue.push(c);

      const slots = WORKER_CONCURRENCY - this.inFlight;
      let dispatched = 0;

      while (dispatched < slots && !queue.isEmpty()) {
        const entry = queue.pop();
        if (!entry) break;

        const job = await this.lifecycle.claimJob(entry.id, this.workerId);
        if (!job) continue; // another worker grabbed it

        const met = await this.lifecycle.dependenciesMet(job.id);
        if (!met) {
          await this.lifecycle.emit(LogEvent.JOB_BLOCKED, job.id, job.status, {
            reason: 'dependencies_unmet',
          });
          await this.lifecycle.transition(job.id, 'pending' as never, {
            workerId: null,
            lockedAt: null,
          });
          continue;
        }

        dispatched++;
        this.inFlight++;
        void this.processJob(job).finally(() => this.inFlight--);
      }
    } catch (err) {
      this.logger.error({ err }, 'Tick error');
    }
  }

  private async processJob(job: Job): Promise<void> {
    await this.lifecycle.emit(LogEvent.JOB_STARTED, job.id, job.status, { workerId: this.workerId });

    try {
      const handler = this.registry.get(job.type);
      await handler(job.payload, job.id, this.dataSource);

      if (await this.lifecycle.isCancelled(job.id)) {
        throw new JobCancelledError(job.id);
      }

      await this.lifecycle.complete(job);
    } catch (err) {
      await this.lifecycle.handleFailure(job, err as Error);
    }
  }
}
