import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Job } from './job.entity';

@Entity('job_dependencies')
@Unique(['jobId', 'dependsOnJobId'])
export class JobDependency {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'job_id', type: 'uuid' }) jobId!: string;
  @Column({ name: 'depends_on_job_id', type: 'uuid' }) dependsOnJobId!: string;

  @ManyToOne(() => Job, (j) => j.dependencies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job!: Job;

  @ManyToOne(() => Job, (j) => j.dependents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depends_on_job_id' })
  dependsOn!: Job;
}
