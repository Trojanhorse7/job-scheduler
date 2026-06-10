import { HeapPriorityQueue } from './binary-heap';
import { TimingWheel } from './timing-wheel';
import { QueueJob } from './types';

const N = 100_000;

function makeJob(id: number, priority: number): QueueJob {
  const now = new Date();
  return {
    id: String(id),
    effectivePriority: priority,
    scheduledAt: new Date(now.getTime() + Math.random() * 5000),
    createdAt: now,
  };
}

function benchHeap(jobs: QueueJob[]): number {
  const q = new HeapPriorityQueue();
  const t0 = performance.now();
  for (const j of jobs) q.push(j);
  while (!q.isEmpty()) q.pop();
  return performance.now() - t0;
}

function benchTimingWheel(jobs: QueueJob[]): number {
  const w = new TimingWheel();
  const t0 = performance.now();
  for (const j of jobs) w.push(j);
  // drain via tick loop
  let remaining = jobs.length;
  while (remaining > 0) {
    const batch = w.tick();
    remaining -= batch.length;
    if (batch.length === 0) break;
  }
  return performance.now() - t0;
}

const jobs = Array.from({ length: N }, (_, i) => makeJob(i, (i % 3) + 1));

const heapMs = benchHeap(jobs);
const wheelMs = benchTimingWheel(jobs);

console.log(`\nBenchmark: ${N.toLocaleString()} jobs`);
console.log(`  Binary Heap     : ${heapMs.toFixed(2)} ms`);
console.log(`  Timing Wheel    : ${wheelMs.toFixed(2)} ms`);
console.log(`  Heap is ${(wheelMs / heapMs).toFixed(2)}x ${heapMs < wheelMs ? 'faster' : 'slower'} than timing wheel\n`);
