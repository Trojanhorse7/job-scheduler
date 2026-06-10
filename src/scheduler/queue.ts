import { SCHEDULER_ALGORITHM } from '../common/config';
import { HeapPriorityQueue } from './binary-heap';
import { TimingWheel } from './timing-wheel';
import { QueueJob, jobRowToQueueEntry, JobRow } from './types';

/**
 * Unified interface over the two scheduling algorithms.
 * The worker calls push/pop without knowing which implementation is active.
 * Switch via SCHEDULER_ALGORITHM env var ('heap' | 'timing_wheel').
 */
export interface SchedulerQueue {
  push(job: QueueJob): void;
  pop(): QueueJob | undefined;
  get size(): number;
  isEmpty(): boolean;
}

class HeapAdapter implements SchedulerQueue {
  private readonly inner = new HeapPriorityQueue();
  push(job: QueueJob): void { this.inner.push(job); }
  pop(): QueueJob | undefined { return this.inner.pop(); }
  get size(): number { return this.inner.size; }
  isEmpty(): boolean { return this.inner.isEmpty(); }
}

class TimingWheelAdapter implements SchedulerQueue {
  private readonly inner = new TimingWheel();
  private pending: QueueJob[] = [];

  push(job: QueueJob): void { this.inner.push(job); }
  pop(): QueueJob | undefined {
    if (this.pending.length === 0) {
      this.pending = this.inner.tick();
    }
    return this.pending.shift();
  }
  get size(): number { return this.inner.size + this.pending.length; }
  isEmpty(): boolean { return this.size === 0; }
}

export function createSchedulerQueue(): SchedulerQueue {
  return SCHEDULER_ALGORITHM === 'timing_wheel'
    ? new TimingWheelAdapter()
    : new HeapAdapter();
}

export { jobRowToQueueEntry, type JobRow };
