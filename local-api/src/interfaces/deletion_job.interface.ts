export enum DeletionJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface DeletionJob {
  id: number;
  todoListId: number;
  status: DeletionJobStatus;
  totalItems: number;
  deletedItems: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
