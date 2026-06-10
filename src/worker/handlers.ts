import { DataSource } from 'typeorm';
import { EmailLog } from '../entities/email-log.entity';
import { HANDLER_FAILURE_RATE } from '../common/config';

export type Handler = (
  payload: Record<string, unknown>,
  jobId: string,
  dataSource: DataSource,
) => Promise<void>;

async function simulateWork(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  await new Promise((r) => setTimeout(r, ms));
  if (Math.random() < HANDLER_FAILURE_RATE) {
    throw new Error('Simulated transient failure');
  }
}

const sendEmail: Handler = async (payload, jobId, dataSource) => {
  await simulateWork(50, 200);
  await dataSource.getRepository(EmailLog).save(
    dataSource.getRepository(EmailLog).create({
      jobId,
      to: String(payload.to ?? 'user@example.com'),
      subject: String(payload.subject ?? 'Notification'),
    }),
  );
};

const generateReport: Handler = async (payload) => {
  await simulateWork(200, 800);
  void payload; // report written to disk in production
};

const uploadFile: Handler = async (payload) => {
  await simulateWork(100, 400);
  void payload;
};

const defaultFallback: Handler = async () => {
  await simulateWork(10, 50);
};

export class HandlerRegistry {
  private readonly map = new Map<string, Handler>();

  register(type: string, handler: Handler): this {
    this.map.set(type, handler);
    return this;
  }

  get(type: string): Handler {
    return this.map.get(type) ?? defaultFallback;
  }
}

export function createDefaultRegistry(): HandlerRegistry {
  return new HandlerRegistry()
    .register('send_email', sendEmail)
    .register('generate_report', generateReport)
    .register('upload_file', uploadFile);
}
