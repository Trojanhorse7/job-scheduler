import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../entities/job.entity';
import { JobLifecycleService } from '../lifecycle/lifecycle.service';

@Injectable()
export class DlqService {
  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    private readonly lifecycle: JobLifecycleService,
  ) {}

  listDlq(): Promise<Job[]> {
    return this.jobs.find({ where: { inDlq: true }, order: { updatedAt: 'DESC' } });
  }

  retry(jobId: string): Promise<Job | null> {
    return this.lifecycle.retryFromDlq(jobId);
  }
}
