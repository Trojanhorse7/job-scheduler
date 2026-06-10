import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Job } from './job.entity';

@Entity('workflows')
export class Workflow {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @OneToMany(() => Job, (j) => j.workflow) jobs!: Job[];
}
