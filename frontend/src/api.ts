export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  effectivePriority: number;
  status: string;
  retryCount: number;
  scheduledAt: string;
  interval: string | null;
  errorMessage: string | null;
  inDlq: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  dlq: number;
  total: number;
}

const API = '/api';

export async function fetchStats(): Promise<JobStats> {
  const res = await fetch(`${API}/jobs/stats`);
  return res.json();
}

export async function fetchJobs(status?: string): Promise<Job[]> {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${API}/jobs${params}`);
  return res.json();
}

export async function fetchDlq(): Promise<Job[]> {
  const res = await fetch(`${API}/dlq`);
  return res.json();
}

export async function createJob(data: Record<string, unknown>): Promise<Job> {
  const res = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cancelJob(id: string): Promise<void> {
  await fetch(`${API}/jobs/${id}`, { method: 'DELETE' });
}

export async function getJobLogs(id: string): Promise<unknown[]> {
  const res = await fetch(`${API}/jobs/${id}/logs`);
  return res.json();
}

export async function retryDlqJob(id: string): Promise<void> {
  await fetch(`${API}/dlq/${id}/retry`, { method: 'POST' });
}

export async function createWorkflow(data: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function subscribeToEvents(
  onEvent: () => void,
  onStatusChange?: (live: boolean) => void,
): () => void {
  const es = new EventSource(`${API}/events`);
  es.onopen = () => onStatusChange?.(true);
  es.onmessage = () => onEvent();
  es.onerror = () => {
    onStatusChange?.(false);
    es.close();
    setTimeout(() => subscribeToEvents(onEvent, onStatusChange), 5000);
  };
  return () => es.close();
}

export const PRIORITY_LABELS: Record<number, string> = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  processing: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
  cancelled: '#6b7280',
};
