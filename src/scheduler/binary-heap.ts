import { QueueJob, compareJobs } from './types';

/**
 * Min-heap priority queue for job dispatch ordering.
 *
 * Heap invariant: every parent compares ≤ its children under `compareJobs`
 * (lower effective_priority value = higher urgency, ties broken by scheduledAt).
 *
 * Complexity: O(log n) push/pop, O(1) peek — suitable for the hundreds of
 * in-memory candidates loaded per dispatch tick.
 */
export class HeapPriorityQueue {
  private heap: QueueJob[] = [];

  get size(): number { return this.heap.length; }
  isEmpty(): boolean { return this.heap.length === 0; }

  push(job: QueueJob): void {
    this.heap.push(job);
    this.bubbleUp(this.heap.length - 1);
  }

  peek(): QueueJob | undefined { return this.heap[0]; }

  pop(): QueueJob | undefined {
    if (this.isEmpty()) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    // Move the last element to the root and restore the heap invariant downward.
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  /** Restore heap invariant upward after a push. */
  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compareJobs(this.heap[i], this.heap[parent]) < 0) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  /** Restore heap invariant downward after a pop. */
  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && compareJobs(this.heap[l], this.heap[smallest]) < 0) smallest = l;
      if (r < n && compareJobs(this.heap[r], this.heap[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
