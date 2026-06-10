# Architecture — Job Scheduler (Monorepo)

## Components

Three independently deployable pieces share one Postgres database:

- **API** (`apps/api`) — REST, Swagger, SSE relay. Never executes jobs.
- **Worker** (`apps/worker`) — NestJS `WorkerService` dispatch loop. Polls DB, orders in memory, claims atomically.
- **Frontend** (`frontend/`) — React dashboard with SSE live updates.

Shared libraries:

- `packages/scheduler` — heap, timing wheel, `createSchedulerQueue()`
- `packages/jobs-core` — `JobLifecycleService`, handlers, `ALLOWED_TRANSITIONS`
- `packages/db` — TypeORM entities

## Dispatch loop (worker)

Each tick (`DISPATCH_POLL_INTERVAL_MS`):

1. **Reclaim stale locks** — jobs stuck in `processing` past `STALE_LOCK_MS` return to `pending`
2. **DLQ alert** — if count ≥ `DLQ_ALERT_THRESHOLD` (default **10**), emit alert event
3. **Load ready set** — SQL selects pending, due, dependency-satisfied jobs
4. **Order in memory** — fresh heap or timing wheel (`SCHEDULER_ALGORITHM`), snapshot `now` for stable aging
5. **Pop → claim → run** — `claimJob()` uses `FOR UPDATE SKIP LOCKED` + status CAS; up to `WORKER_CONCURRENCY` jobs in flight

## Heap ordering

Comparator (lower = first):

1. Effective priority (includes aging: every `AGING_THRESHOLD_SECONDS` waited, priority improves by 1)
2. `scheduled_at`
3. `created_at`

## Status flow

Enforced in `JobLifecycleService.transition()` via `ALLOWED_TRANSITIONS`:

```
pending → processing → completed
              ├→ pending (retry)
              ├→ failed (DLQ)
              └→ cancelled (cooperative)
pending → cancelled
failed → pending (manual DLQ retry)
```

## Duplicate protection

Heap picks order; DB guarantees exclusivity:

- `FOR UPDATE SKIP LOCKED` on claim
- `WHERE status = 'pending'` compare-and-swap

## Live updates

Worker/API call `pg_notify('job_events', …)`. API `EventsService` runs `LISTEN job_events` and fans out to SSE clients.

## Cancellation

- **Pending:** immediate `cancelled`
- **Processing:** set `cancel_requested`; worker checks at handler checkpoints and aborts cooperatively

## Deployment

See `deploy/` for Nginx + Docker configs.
