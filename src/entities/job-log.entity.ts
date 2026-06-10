import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('job_logs')
@Index(['jobId', 'createdAt'])
export class JobLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'job_id', type: 'uuid' }) jobId!: string;
  @Column() event!: string;
  @Column({ type: 'varchar', nullable: true }) status!: string | null;
  @Column({ type: 'jsonb', default: {} }) context!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
