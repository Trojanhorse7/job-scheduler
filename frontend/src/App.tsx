import { useState, useEffect, useCallback } from 'react';
import {
  fetchStats,
  fetchJobs,
  fetchDlq,
  createJob,
  cancelJob,
  retryDlqJob,
  createWorkflow,
  subscribeToEvents,
  Job,
  JobStats,
  PRIORITY_LABELS,
  STATUS_COLORS,
} from './api';

type Tab = 'dashboard' | 'jobs' | 'create' | 'dlq';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<JobStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dlqJobs, setDlqJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [live, setLive] = useState(true);

  const refresh = useCallback(async () => {
    const [s, j, d] = await Promise.all([
      fetchStats(),
      fetchJobs(statusFilter || undefined),
      fetchDlq(),
    ]);
    setStats(s);
    setJobs(j);
    setDlqJobs(d);
  }, [statusFilter]);

  useEffect(() => {
    refresh();
    const unsub = subscribeToEvents(refresh);
    return unsub;
  }, [refresh]);

  return (
    <div className="app">
      <header>
        <h1>Job Scheduler</h1>
        <div className="live-badge">
          {live && <span className="live-dot" />}
          {live ? 'Live (SSE)' : 'Reconnecting…'}
        </div>
      </header>

      <nav>
        {(['dashboard', 'jobs', 'create', 'dlq'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'dlq' ? 'DLQ' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && stats && <Dashboard stats={stats} />}
      {tab === 'jobs' && (
        <JobsTable
          jobs={jobs}
          statusFilter={statusFilter}
          onFilterChange={setStatusFilter}
          onCancel={async (id) => { await cancelJob(id); refresh(); }}
        />
      )}
      {tab === 'create' && <CreateJobForm onCreated={refresh} />}
      {tab === 'dlq' && <DlqView jobs={dlqJobs} onRetry={async (id) => { await retryDlqJob(id); refresh(); }} />}
    </div>
  );
}

function Dashboard({ stats }: { stats: JobStats }) {
  const items = [
    { label: 'pending', count: stats.pending },
    { label: 'processing', count: stats.processing },
    { label: 'completed', count: stats.completed },
    { label: 'failed', count: stats.failed },
    { label: 'cancelled', count: stats.cancelled },
    { label: 'dlq', count: stats.dlq },
  ];

  return (
    <>
      <div className="stats-grid">
        {items.map(({ label, count }) => (
          <div key={label} className="stat-card">
            <div className="count">{count}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Total Jobs: {stats.total}</h2>
      </div>
    </>
  );
}

function JobsTable({
  jobs,
  statusFilter,
  onFilterChange,
  onCancel,
}: {
  jobs: Job[];
  statusFilter: string;
  onFilterChange: (s: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="card">
      <h2>Jobs</h2>
      <div className="filter-bar">
        <select value={statusFilter} onChange={(e) => onFilterChange(e.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'processing', 'completed', 'failed', 'cancelled'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {jobs.length === 0 ? (
        <div className="empty">No jobs found</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Retries</th>
              <th>Scheduled</th>
              <th>Interval</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td><span className="job-id">{job.id.slice(0, 8)}…</span></td>
                <td>{job.type}</td>
                <td>{PRIORITY_LABELS[job.priority] ?? job.priority}</td>
                <td>
                  <span
                    className="status-badge"
                    style={{ background: STATUS_COLORS[job.status] + '33', color: STATUS_COLORS[job.status] }}
                  >
                    {job.status}
                  </span>
                </td>
                <td>{job.retryCount}</td>
                <td>{new Date(job.scheduledAt).toLocaleString()}</td>
                <td>{job.interval ?? '—'}</td>
                <td>{new Date(job.createdAt).toLocaleString()}</td>
                <td>
                  {(job.status === 'pending' || job.status === 'processing') && (
                    <button className="btn btn-sm btn-danger" onClick={() => onCancel(job.id)}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateJobForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState('send_email');
  const [priority, setPriority] = useState(2);
  const [payload, setPayload] = useState('{"to": "test@gmail.com", "subject": "Welcome"}');
  const [scheduledAt, setScheduledAt] = useState('');
  const [interval, setInterval] = useState('');
  const [mode, setMode] = useState<'job' | 'workflow'>('job');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'workflow') {
        await createWorkflow({
          name: 'report_pipeline',
          steps: [
            { key: 'generate_report', type: 'generate_report', payload: {} },
            { key: 'upload_file', type: 'upload_file', dependsOn: ['generate_report'], payload: {} },
            {
              key: 'send_email',
              type: 'send_email',
              dependsOn: ['upload_file'],
              priority: 1,
              payload: JSON.parse(payload),
            },
          ],
        });
      } else {
        await createJob({
          type,
          priority: Number(priority),
          payload: JSON.parse(payload),
          ...(scheduledAt && { scheduledAt: new Date(scheduledAt).toISOString() }),
          ...(interval && { interval }),
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <h2>Create {mode === 'workflow' ? 'Workflow' : 'Job'}</h2>
      <div className="filter-bar" style={{ marginBottom: '1rem' }}>
        <button className={`btn ${mode === 'job' ? '' : 'btn-sm'}`} onClick={() => setMode('job')}>Single Job</button>
        <button className={`btn ${mode === 'workflow' ? '' : 'btn-sm'}`} onClick={() => setMode('workflow')}>DAG Workflow</button>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        {mode === 'job' && (
          <>
            <div>
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="send_email">send_email</option>
                <option value="generate_report">generate_report</option>
                <option value="upload_file">upload_file</option>
              </select>
            </div>
            <div>
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>High (1)</option>
                <option value={2}>Medium (2)</option>
                <option value={3}>Low (3)</option>
              </select>
            </div>
            <div>
              <label>Scheduled At (optional)</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <label>Interval (optional)</label>
              <select value={interval} onChange={(e) => setInterval(e.target.value)}>
                <option value="">None</option>
                <option value="every_1_minute">every_1_minute</option>
                <option value="every_5_minutes">every_5_minutes</option>
                <option value="every_1_hour">every_1_hour</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label>Payload (JSON){mode === 'workflow' && ' — email step'}</label>
          <textarea value={payload} onChange={(e) => setPayload(e.target.value)} />
        </div>
        {error && <div className="error-box">{error}</div>}
        <button type="submit" className="btn">
          {mode === 'workflow' ? 'Create Workflow' : 'Create Job'}
        </button>
      </form>
    </div>
  );
}

function DlqView({ jobs, onRetry }: { jobs: Job[]; onRetry: (id: string) => void }) {
  return (
    <div className="card">
      <h2>Dead-Letter Queue ({jobs.length})</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Alert fires when DLQ reaches {10} jobs. Processing jobs use cooperative cancel.
      </p>
      {jobs.length === 0 ? (
        <div className="empty">No jobs in DLQ</div>
      ) : (
        jobs.map((job) => (
          <div key={job.id} style={{ borderBottom: '1px solid var(--border)', padding: '1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{job.type}</strong>
                <span className="job-id" style={{ marginLeft: '0.5rem' }}>{job.id}</span>
              </div>
              <button className="btn btn-sm" onClick={() => onRetry(job.id)}>Retry</button>
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              Retries: {job.retryCount} · Failed: {new Date(job.updatedAt).toLocaleString()}
            </div>
            {job.errorMessage && <div className="error-box">{job.errorMessage}</div>}
          </div>
        ))
      )}
    </div>
  );
}
