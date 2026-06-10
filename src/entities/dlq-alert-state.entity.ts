import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('dlq_alert_state')
export class DlqAlertState {
  @PrimaryColumn({ type: 'int' }) id!: number;
  @Column({ name: 'last_alert_at', type: 'timestamptz', nullable: true }) lastAlertAt!: Date | null;
  @Column({ name: 'last_dlq_count', type: 'int', default: 0 }) lastDlqCount!: number;
}
