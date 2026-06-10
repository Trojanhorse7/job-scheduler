# Job Scheduler

A production-grade background job scheduler built with NestJS, PostgreSQL, and Redis.

## Features

- **Heap-based priority queue** — min-heap orders jobs by effective priority + scheduled time
- **Timing wheel** — alternative O(1) scheduling algorithm; switch via `SCHEDULER_ALGORITHM=timing_wheel`
- **Starvation prevention** — low-priority jobs age up after `AGING_THRESHOLD_SECONDS` seconds
- **Retries with backoff** — exponential backoff + jitter, configurable `MAX_RETRIES`
- **Dead-letter queue** — exhausted jobs move to DLQ; manual retry via API
- **DLQ alerts** — hysteresis-guarded threshold alert logged when DLQ fills up
- **DAG workflows** — multi-step jobs with `dependsOn` key references
- **Recurring jobs** — set `interval` (1 min / 5 min / 1 hr) for automatic rescheduling
- **Cooperative cancellation** — API sets a flag; running handler checks and exits cleanly
- **Stale-lock recovery** — jobs stuck in PROCESSING beyond `STALE_LOCK_MS` are re-queued
- **Live UI** — React dashboard with SSE updates pushed via Redis pub/sub
- **Pino logging** — structured JSON logs in production, pretty-print in dev

## Quick Start

```bash
cp .env.example .env
docker compose up -d                 # PostgreSQL + Redis
npm install                          # backend deps
npm install --prefix frontend        # frontend deps (one-time)
npm run dev                          # API on :4000  +  worker in parallel
npm run dev:frontend                 # React UI on :5173
npm run benchmark                    # heap vs timing-wheel comparison
```

| URL | Description |
|-----|-------------|
| http://localhost:5173 | React dashboard |
| http://localhost:4000/api/docs | Swagger / API docs |
| http://localhost:4000/api/health | Health check |

## Project Layout

```
src/
  common/       enums, config constants, FSM transitions, raw pino logger
  entities/     TypeORM entities (Job, Workflow, JobLog, DlqAlertState, …)
  database/     TypeOrmModule setup + AppDataSource for CLI migrations
  scheduler/    BinaryHeap, TimingWheel, SchedulerQueue interface, benchmark
  redis/        RedisService (ioredis publisher + subscriber factory)
  lifecycle/    JobLifecycleService — all job state-change logic
  jobs/         REST CRUD for jobs (create, list, cancel, logs, stats)
  worker/       WorkerService dispatch loop + HandlerRegistry
  dlq/          DLQ list + retry endpoint
  workflows/    DAG workflow creation and status
  events/       Redis subscriber → SSE fan-out
  main.ts       API entry (NestFactory.create)
  worker.ts     Worker entry (NestFactory.createApplicationContext)
frontend/       React + Vite dashboard
deploy/         Docker Compose (prod), Dockerfiles, Nginx config
docs/           Architecture notes
```

## API Highlights

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs` | Create a job (supports `scheduledAt`, `interval`, `dependsOn`) |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/stats` | Count by status |
| GET | `/api/jobs/:id/logs` | Event timeline for a job |
| DELETE | `/api/jobs/:id` | Cancel a job |
| GET | `/api/dlq` | List dead-lettered jobs |
| POST | `/api/dlq/:id/retry` | Re-queue a DLQ job |
| POST | `/api/workflows` | Create a DAG workflow |
| GET | `/api/events` | SSE stream for live updates |

## Architecture

### System Overview
![System Overview](docs/System%20Overview.png)

### Request Flow — Creating a Job
![Request Flow](docs/Request%20Flow%20-%20Creating%20a%20Job.png)

### Job Status FSM
![Job Status FSM](docs/Job%20Status%20FSM.png)

### Worker Dispatch Loop
![Worker Dispatch Loop](docs/Worker%20Dispatch%20Loop.png)

### Retry & Backoff Model
![Retry & Backoff Model](docs/Retry%20%26%20Backoff%20Model.png)

### Redis Pub/Sub → SSE
![Redis PubSub to SSE](docs/Redis%20PubSub%20to%20SSE.png)

### Deployment Architecture
![Deployment Architecture](docs/Deployment%20Architecture.png)

---

- [Swagger](http://localhost:4000/api/docs) — interactive API reference (run locally)

## Configuration

All settings are in `.env.example`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ALGORITHM` | `heap` | `heap` or `timing_wheel` |
| `WORKER_CONCURRENCY` | `4` | Max parallel jobs per worker |
| `DISPATCH_POLL_INTERVAL_MS` | `500` | Worker tick interval |
| `MAX_RETRIES` | `3` | Max attempts before DLQ |
| `BACKOFF_BASE_SECONDS` | `5` | Exponential backoff base |
| `AGING_THRESHOLD_SECONDS` | `60` | Priority boost interval |
| `DLQ_ALERT_THRESHOLD` | `10` | Alert when DLQ exceeds this |
| `STALE_LOCK_MS` | `60000` | Reset locks older than this |
