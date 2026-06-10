import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import { Job } from '../entities/job.entity';
import { JobDependency } from '../entities/job-dependency.entity';
import { JobStatus, LogEvent } from '../common/enums';
import { MAX_RETRIES } from '../common/config';
import { JobLifecycleService } from '../lifecycle/lifecycle.service';
import { CreateWorkflowDto } from './dto/workflow.dto';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(JobDependency) private readonly deps: Repository<JobDependency>,
    private readonly lifecycle: JobLifecycleService,
  ) {}

  async create(dto: CreateWorkflowDto): Promise<Workflow> {
    const keys = dto.steps.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Workflow step keys must be unique');
    }

    const workflow = await this.workflows.save(this.workflows.create({ name: dto.name }));

    const jobMap = new Map<string, string>(); // key → jobId

    for (const step of dto.steps) {
      const job = await this.jobs.save(
        this.jobs.create({
          type: step.type,
          payload: step.payload ?? {},
          priority: step.priority ?? 2,
          effectivePriority: step.priority ?? 2,
          maxRetries: MAX_RETRIES,
          parentWorkflowId: workflow.id,
          workflowKey: step.key,
          scheduledAt: new Date(),
        }),
      );
      jobMap.set(step.key, job.id);
      await this.lifecycle.emit(LogEvent.JOB_CREATED, job.id, JobStatus.PENDING, {
        workflow: workflow.id,
        key: step.key,
      });
    }

    for (const step of dto.steps) {
      if (!step.dependsOn?.length) continue;
      const jobId = jobMap.get(step.key)!;
      for (const depKey of step.dependsOn) {
        const depJobId = jobMap.get(depKey);
        if (!depJobId) throw new BadRequestException(`Unknown dependency key: ${depKey}`);
        await this.deps.save(this.deps.create({ jobId, dependsOnJobId: depJobId }));
      }
    }

    return this.workflows.findOne({
      where: { id: workflow.id },
      relations: { jobs: true },
    }) as Promise<Workflow>;
  }

  findAll(): Promise<Workflow[]> {
    return this.workflows.find({ relations: { jobs: true }, order: { createdAt: 'DESC' } });
  }

  findOne(id: string): Promise<Workflow | null> {
    return this.workflows.findOne({ where: { id }, relations: { jobs: true } });
  }
}
