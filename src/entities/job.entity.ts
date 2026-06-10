import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  OneToMany, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { JobStatus, JobInterval } from '../common/enums';
import { JobDependency } from './job-dependency.entity';
import { Workflow } from './workflow.entity';

@Entity('jobs')
@Index(['status', 'effectivePriority', 'scheduledAt', 'createdAt'])
@Index(['inDlq'])
export class Job {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() type!: string;
  @Column({ type: 'jsonb', default: {} }) payload!: Record<string, unknown>;
  @Column({ type: 'int', default: 2 }) priority!: number;
  @Column({ name: 'effective_priority', type: 'int', default: 2 }) effectivePriority!: number;
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING }) status!: JobStatus;
  @Column({ name: 'retry_count', type: 'int', default: 0 }) retryCount!: number;
  @Column({ name: 'max_retries', type: 'int', default: 3 }) maxRetries!: number;
  @Column({ name: 'scheduled_at', type: 'timestamptz', default: () => 'NOW()' }) scheduledAt!: Date;
  @Column({ type: 'enum', enum: JobInterval, nullable: true }) interval!: JobInterval | null;
  @Column({ name: 'parent_workflow_id', type: 'uuid', nullable: true }) parentWorkflowId!: string | null;
  @Column({ name: 'workflow_key', type: 'varchar', nullable: true }) workflowKey!: string | null;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ name: 'in_dlq', type: 'boolean', default: false }) inDlq!: boolean;
  @Column({ name: 'worker_id', type: 'varchar', nullable: true }) workerId!: string | null;
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true }) lockedAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'cancel_requested', type: 'boolean', default: false }) cancelRequested!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;

  @OneToMany(() => JobDependency, (d) => d.job) dependencies!: JobDependency[];
  @OneToMany(() => JobDependency, (d) => d.dependsOn) dependents!: JobDependency[];
  @ManyToOne(() => Workflow, (w) => w.jobs, { nullable: true })
  @JoinColumn({ name: 'parent_workflow_id' })
  workflow!: Workflow | null;
}
