import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'job_id', type: 'uuid' }) jobId!: string;
  @Column() to!: string;
  @Column() subject!: string;
  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' }) sentAt!: Date;
}
