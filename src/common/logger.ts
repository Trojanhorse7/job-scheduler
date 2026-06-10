import pino from 'pino';

export function createLogger(service: string) {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  });
}
