import { QueueJob } from './types';
import { HeapPriorityQueue } from './binary-heap';

/**
 * Hierarchical timing wheel — an alternative O(1) scheduling algorithm.
 *
 * The wheel divides time into NUM_SLOTS fixed-size buckets (100 ms each),
 * covering a 60-second window. Inserting a job maps its scheduledAt to the
 * correct bucket in O(1). On each tick we drain all buckets whose deadline
 * has passed.
 *
 * Jobs scheduled beyond the 60 s window are held in an overflow min-heap and
 * migrated into the wheel lazily as time advances — keeping insertion O(1)
 * for the common case while correctly handling far-future jobs.
 *
 * Trade-off vs binary heap: lower per-insert cost (O(1) vs O(log n)) but
 * higher memory overhead (600 heap slots always allocated). Preferred for
 * high-throughput scenarios with dense near-future scheduling.
 */

const RESOLUTION_MS = 100;
const NUM_SLOTS = 600; // 60-second window at 100 ms resolution

export class TimingWheel {
  private readonly slots: HeapPriorityQueue[];
  /** Holds jobs scheduled beyond the current wheel window. */
  private readonly overflowHeap: HeapPriorityQueue;
  private currentSlot = 0;
  private epochMs: number;

  constructor() {
    this.slots = Array.from({ length: NUM_SLOTS }, () => new HeapPriorityQueue());
    this.overflowHeap = new HeapPriorityQueue();
    this.epochMs = Date.now();
  }

  get size(): number {
    return this.slots.reduce((s, slot) => s + slot.size, 0) + this.overflowHeap.size;
  }

  push(job: QueueJob): void {
    const now = Date.now();
    const runAt = Math.max(job.scheduledAt.getTime(), now);
    const ticksAhead = Math.floor((runAt - this.epochMs) / RESOLUTION_MS);

    if (ticksAhead >= NUM_SLOTS) {
      // Beyond the wheel window — park in overflow heap.
      this.overflowHeap.push(job);
    } else {
      const slot = (this.currentSlot + Math.max(0, ticksAhead)) % NUM_SLOTS;
      this.slots[slot].push(job);
    }
  }

  /**
   * Advance the wheel to the current time and return all jobs whose
   * scheduledAt has been reached. Call this on every worker tick.
   */
  tick(): QueueJob[] {
    const now = Date.now();
    const ticksElapsed = Math.floor((now - this.epochMs) / RESOLUTION_MS);
    const ready: QueueJob[] = [];

    while (this.currentSlot <= ticksElapsed) {
      const slot = this.currentSlot % NUM_SLOTS;
      while (!this.slots[slot].isEmpty()) {
        ready.push(this.slots[slot].pop()!);
      }
      this.currentSlot++;
    }

    // Migrate overflow jobs that now fit within the wheel's current window.
    while (!this.overflowHeap.isEmpty()) {
      const top = this.overflowHeap.peek()!;
      const ticksAhead = Math.floor((top.scheduledAt.getTime() - now) / RESOLUTION_MS);
      if (ticksAhead < NUM_SLOTS) {
        this.overflowHeap.pop();
        this.push(top);
      } else break;
    }

    return ready;
  }
}
