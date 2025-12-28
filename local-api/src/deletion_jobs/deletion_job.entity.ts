import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeletionJobStatus } from '../interfaces/deletion_job.interface';

@Entity()
export class DeletionJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  todoListId: number;

  @Column({
    type: 'enum',
    enum: DeletionJobStatus,
    default: DeletionJobStatus.PENDING,
  })
  status: DeletionJobStatus;

  @Column({ default: 0 })
  totalItems: number;

  @Column({ default: 0 })
  deletedItems: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt?: Date;
}
