# Architecture — Job Scheduler

Background job scheduler for Dilamme (Stage 9). NestJS API + independent worker, PostgreSQL for persistence, Redis for live event fan-out, React dashboard.

**Live:** https://dilamme-job.duckdns.org  
**Repo:** https://github.com/Trojanhorse7/job-scheduler

Diagrams are in [`docs/`](../docs/) and embedded in the [README](../README.md).

---

## 1. System overview

Three processes run independently and share one PostgreSQL database:

| Process | Entry | Role |
|---------|-------|------|
| **API** | `src/main.ts` | REST, Swagger, SSE relay. Never executes jobs. |
| **Worker** | `src/worker.ts` | Polls DB, orders jobs in memory, claims and runs handlers. |
| **Frontend** | `frontend/` | React dashboard; live updates via SSE. |

Supporting infrastructure:

- **PostgreSQL** — jobs, dependencies, workflows, event logs, DLQ state
- **Redis** — pub/sub channel `job:updates` for SSE fan-out
- **Nginx** (host) — HTTPS reverse proxy to frontend (`:3000`) and API (`:4000`)

![System Overview](System%20Overview.png)

---

## 2. Job model

Each job has:

- `type` — handler key (`send_email`, `generate_report`, `upload_file`)
- `payload` — JSON body
- `priority` — 1 = High, 2 = Medium, 3 = Low
- `effective_priority` — base priority after aging (starvation prevention)
- `scheduled_at` — jobs do not run until this time
- `interval` — optional recurrence (`every_1_minute`, `every_5_minutes`, `every_1_hour`)

### Status flow

Every job follows a strict finite-state machine enforced by `assertTransition()` in `src/common/transitions.ts`:

```
pending → processing → completed
              ├→ pending   (retry with backoff)
              ├→ failed    (retries exhausted → DLQ)
              └→ cancelled (cooperative cancel)
pending → cancelled
failed  → pending  (manual DLQ retry via API)
```

![Job Status FSM](Job%20Status%20FSM.png)

---

## 3. Worker dispatch loop

The worker ticks every `DISPATCH_POLL_INTERVAL_MS` (default 500 ms):

1. **Reset stale locks** — jobs in `processing` longer than `STALE_LOCK_MS` (60 s) return to `pending`
2. **DLQ alert check** — if count ≥ `DLQ_ALERT_THRESHOLD` (10), emit structured alert
3. **Load candidates** — SQL selects up to 200 pending jobs where `scheduled_at <= NOW()` and `in_dlq = false`
4. **Order in memory** — push into Binary Heap or Timing Wheel (`SCHEDULER_ALGORITHM`)
5. **Pop → claim → run** — atomic claim via `FOR UPDATE SKIP LOCKED`; up to `WORKER_CONCURRENCY` (4) jobs in flight
6. **Dependency check** — skip jobs whose DAG upstream steps are not `completed`

![Worker Dispatch Loop](Worker%20Dispatch%20Loop.png)

---

## 4. Heap-based priority queue

The min-heap (`src/scheduler/binary-heap.ts`) is the default scheduler.

**Comparator** (lower value = runs first):

1. `effective_priority` (includes aging boost)
2. `scheduled_at`
3. `created_at` (tiebreaker when priority and schedule match)

**Complexity:** O(log n) push and pop.

Scheduled jobs only enter the candidate set when `scheduled_at <= NOW()`. Recurring jobs re-enter the queue after completion when a new row is inserted with the next `scheduled_at`.

### Starvation prevention

Low-priority jobs cannot wait forever. Every `AGING_THRESHOLD_SECONDS` (60 s) waited, `effective_priority` improves by one level. A LOW job (3) reaches HIGH (1) after 120 s, guaranteeing eventual execution.

**Aging formula** (`src/scheduler/types.ts`):

```typescript
const waitSeconds = (now - createdAt) / 1000;
const boost = Math.floor(waitSeconds / AGING_THRESHOLD_SECONDS);
effectivePriority = Math.max(1, basePriority - boost);
```

| Wait time | LOW (3) effective priority |
|-----------|---------------------------|
| 0 s | 3 (Low) |
| 60 s | 2 (Medium) |
| 120 s | 1 (High) — guaranteed to run next |

---

## 5. Timing wheel (alternative algorithm)

Implemented in `src/scheduler/timing-wheel.ts`.

- 600 slots × 100 ms resolution = 60-second window
- O(1) insert for jobs within the window
- Overflow heap for jobs scheduled beyond 60 s

Switch via `SCHEDULER_ALGORITHM=timing_wheel`.

### Benchmark (100,000 jobs)

| Environment | Binary Heap | Timing Wheel |
|-------------|-------------|--------------|
| Local (Windows) | 2361 ms | 2119 ms |
| Server (VPS) | 279 ms | 75 ms |

Run: `npm run benchmark` (local) or `npm run build && npm run benchmark:prod` (server).

**Tradeoff:** Timing wheel wins on insert-heavy workloads; heap is simpler, lower memory, and sufficient for production dispatch batches (≤200 candidates per tick).

---

## 6. Duplicate protection

The heap decides *order*; PostgreSQL guarantees *exclusivity*:

```sql
UPDATE jobs SET status = 'processing', worker_id = $1, locked_at = NOW()
WHERE id = (
  SELECT id FROM jobs
  WHERE id = $2 AND status = 'pending' AND scheduled_at <= NOW() AND in_dlq = false
  FOR UPDATE SKIP LOCKED
)
RETURNING *
```

If two workers race, exactly one wins; the other gets no row back and moves on.

---

## 7. Retries and dead-letter queue

On handler failure, `retry_count` increments. Backoff with jitter:

| Attempt | Delay (approx) |
|---------|----------------|
| 1 | ~1 s  (`5^0 × 1000 ms`) |
| 2 | ~5 s  (`5^1 × 1000 ms`) |
| 3 | ~25 s (`5^2 × 1000 ms`) |

After `MAX_RETRIES` (3) failures, status → `failed`, `in_dlq = true`.

![Retry & Backoff Model](Retry%20%26%20Backoff%20Model.png)

**DLQ:** Engineers inspect failed jobs in the UI (error message visible) and retry via `POST /api/dlq/:id/retry`. Failed retries return to DLQ.

**DLQ alert:** When DLQ count crosses threshold **10**, a `dlq.alert_sent` event is emitted — structured pino log + Redis pub/sub + SSE (simulated email, same pattern as job handlers). Hysteresis: alert fires only when crossing 10 from below; count must drop below 10 before the next alert.

---

## 8. DAG workflows

Workflows are created via `POST /api/workflows` with steps and `dependsOn` key references.

Example pipeline:

```
generate_report → upload_file → send_email
```

Each step is a separate `jobs` row linked by `job_dependencies`. The worker calls `dependenciesMet()` before processing — if upstream jobs are not `completed`, the job is returned to `pending` and logged as `job.blocked`.

---

## 9. Scheduled and recurring jobs

- **Scheduled:** `scheduled_at` in the future → excluded from candidate SQL until due
- **Recurring:** on `complete()`, a new job row is inserted with `scheduled_at = now + interval`

Intervals: `every_1_minute` (60 s), `every_5_minutes` (300 s), `every_1_hour` (3600 s).

---

## 10. Cancellation

| State | Behaviour |
|-------|-----------|
| `pending` | Immediate transition to `cancelled` |
| `processing` | Set `cancel_requested = true`; worker checks after handler and aborts cooperatively → `cancelled` |

Documented decision: cooperative cancel avoids killing mid-transaction DB writes; the handler finishes its current step, then the worker detects the flag and transitions to `cancelled`.

---

## 11. Job handlers

Handlers live in `src/worker/handlers.ts` and are registered by job `type`.

**`send_email`** (primary working handler):

- Simulates network latency (50–200 ms)
- Writes a row to `email_logs` (real DB insert — not a fake 200)
- ~10% simulated failure rate (`HANDLER_FAILURE_RATE`) to exercise retries

Also implemented: `generate_report`, `upload_file` (latency simulation).

---

## 12. Live updates (SSE)

![Redis PubSub to SSE](Redis%20PubSub%20to%20SSE.png)

1. API or worker calls `JobLifecycleService.emit()` on every state change
2. Event persisted to `job_logs` table
3. Payload published to Redis channel `job:updates`
4. `EventsService` (API) subscribes once and fans out to all SSE clients via RxJS `Subject`
5. React UI uses `EventSource('/api/events')` and refreshes dashboard on each message

Nginx SSE route has `proxy_buffering off` and `proxy_read_timeout 86400s`.

---

## 13. Logging

All significant events use **pino** structured JSON (nestjs-pino in NestJS modules):

| Event | Log key |
|-------|---------|
| Job created | `job.created` |
| Job started | `job.started` |
| Retry attempted | `job.retry` |
| Job failed | `job.failed` |
| Job cancelled | `job.cancelled` |
| Job completed | `job.completed` |
| DLQ alert | `dlq.alert_sent` |

Events are also stored in `job_logs` for per-job timelines (`GET /api/jobs/:id/logs`).

---

## 14. Deployment

![Deployment Architecture](Deployment%20Architecture.png)

Manual VPS deployment (no managed PaaS):

- **Domain:** dilamme-job.duckdns.org (DuckDNS)
- **HTTPS:** Let's Encrypt via certbot
- **Reverse proxy:** Nginx on host → Docker containers
- **Stack:** `docker compose -f deploy/docker-compose.prod.yml up -d`

| Container | Port (host) | Purpose |
|-----------|-------------|---------|
| frontend | 3000 | React static + internal nginx |
| api | 4000 | NestJS REST + SSE |
| worker | — | Dispatch loop |
| postgres | — | Database |
| redis | — | Pub/sub |

Config files: `deploy/nginx.conf`, `deploy/docker-compose.prod.yml`, `deploy/Dockerfile.*`.

---

## 15. Request flow (create job)

![Request Flow](Request%20Flow%20-%20Creating%20a%20Job.png)

1. UI → `POST /api/jobs`
2. API inserts job (`status = pending`)
3. API publishes `job.created` to Redis
4. SSE pushes update to browser
5. Worker tick loads candidate, heap orders it, claims atomically
6. Handler runs → `completed` or retry/DLQ path
7. Each transition publishes to Redis → UI refreshes live
