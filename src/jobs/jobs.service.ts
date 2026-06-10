import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Job } from '../entities/job.entity';
import { JobDependency } from '../entities/job-dependency.entity';
import { JobLog } from '../entities/job-log.entity';
import { JobStatus, LogEvent } from '../common/enums';
import { MAX_RETRIES } from '../common/config';
import { JobLifecycleService } from '../lifecycle/lifecycle.service';
import { CreateJobDto } from './dto/job.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(JobDependency) private readonly deps: Repository<JobDependency>,
    private readonly lifecycle: JobLifecycleService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateJobDto): Promise<Job> {
    const job = this.jobs.create({
      type: dto.type,
      payload: dto.payload ?? {},
      priority: dto.priority ?? 2,
      effectivePriority: dto.priority ?? 2,
      maxRetries: dto.maxRetries ?? MAX_RETRIES,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
      interval: dto.interval ?? null,
    });
    const saved = await this.jobs.save(job);

    if (dto.dependsOn?.length) {
      const depRows = dto.dependsOn.map((depId) =>
        this.deps.create({ jobId: saved.id, dependsOnJobId: depId }),
      );
      await this.deps.save(depRows);
    }

    await this.lifecycle.emit(LogEvent.JOB_CREATED, saved.id, JobStatus.PENDING, {
      type: saved.type,
      priority: saved.priority,
    });
    return saved;
  }

  findAll(): Promise<Job[]> {
    return this.jobs.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async cancel(id: string): Promise<{ ok: boolean; message: string }> {
    const result = await this.lifecycle.cancel(id);
    if (!result.ok) throw new NotFoundException(result.message);
    return result;
  }

  getLogs(jobId: string): Promise<JobLog[]> {
    return this.lifecycle.getLogs(jobId);
  }

  async getStats(): Promise<Record<string, number>> {
    const rows: { status: string; count: string }[] = await this.dataSource.query(
      `SELECT status, COUNT(*) AS count FROM jobs GROUP BY status`,
    );
    const dlqRow: [{ count: string }] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM jobs WHERE in_dlq=true`,
    );
    const stats: Record<string, number> = { dlq: Number(dlqRow[0].count) };
    for (const r of rows) stats[r.status] = Number(r.count);
    return stats;
  }
}
