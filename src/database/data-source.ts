import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Job } from '../entities/job.entity';
import { JobDependency } from '../entities/job-dependency.entity';
import { Workflow } from '../entities/workflow.entity';
import { JobLog } from '../entities/job-log.entity';
import { DlqAlertState } from '../entities/dlq-alert-state.entity';
import { EmailLog } from '../entities/email-log.entity';

export const entities = [Job, JobDependency, Workflow, JobLog, DlqAlertState, EmailLog];

export function getDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgresql://scheduler:scheduler@localhost:5432/job_scheduler',
    entities,
    synchronize: process.env.TYPEORM_SYNC !== 'false',
    logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  };
}

export const AppDataSource = new DataSource(getDataSourceOptions());
