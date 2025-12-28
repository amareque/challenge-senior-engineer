import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeletionJob } from './deletion_job.entity';
import {
  DeletionJob as DeletionJobInterface,
  DeletionJobStatus,
} from '../interfaces/deletion_job.interface';
import { Todo } from '../todos/todo.entity';
import { TodoList } from '../todo_lists/todo_list.entity';

@Injectable()
export class DeletionJobsService {
  constructor(
    @InjectRepository(DeletionJob)
    private readonly deletionJobRepository: Repository<DeletionJob>,
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @InjectRepository(TodoList)
    private readonly todoListRepository: Repository<TodoList>,
  ) {}

  async create(todoListId: number): Promise<DeletionJobInterface> {
    // Check if to do list exists
    const todoList = await this.todoListRepository.findOneBy({
      id: todoListId,
    });
    if (!todoList) {
      throw new NotFoundException(`TodoList with id ${todoListId} not found`);
    }

    // Count total items to delete
    const totalItems = await this.todoRepository.count({
      where: { todoList: { id: todoListId } },
    });

    const deletionJob = this.deletionJobRepository.create({
      todoListId,
      status: DeletionJobStatus.PENDING,
      totalItems,
      deletedItems: 0,
    });

    const savedJob = await this.deletionJobRepository.save(deletionJob);
    return this.toInterface(savedJob);
  }

  async get(jobId: number): Promise<DeletionJobInterface> {
    const job = await this.deletionJobRepository.findOneBy({ id: jobId });
    if (!job) {
      throw new NotFoundException(`DeletionJob with id ${jobId} not found`);
    }
    return this.toInterface(job);
  }

  async all(): Promise<DeletionJobInterface[]> {
    const jobs = await this.deletionJobRepository.find({
      order: { createdAt: 'DESC' },
    });
    return jobs.map((job) => this.toInterface(job));
  }

  async processDeletion(jobId: number): Promise<void> {
    const job = await this.deletionJobRepository.findOneBy({ id: jobId });
    if (!job) {
      throw new NotFoundException(`DeletionJob with id ${jobId} not found`);
    }

    // Update status to processing
    if (job.status === DeletionJobStatus.PENDING) {
      job.status = DeletionJobStatus.PROCESSING;
      await this.deletionJobRepository.save(job);
    }

    // Wait 30 seconds before processing (for testing)
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Delete 1 item at a time (for testing)
    const itemsToDelete = await this.todoRepository.find({
      where: { todoList: { id: job.todoListId } },
      take: 1,
    });

    if (itemsToDelete.length === 0) {
      // No more items to delete, mark as completed
      job.status = DeletionJobStatus.COMPLETED;
      job.completedAt = new Date();

      // Delete the to do list itself
      await this.todoListRepository.delete(job.todoListId);
    } else {
      // Delete the single item
      const idsToDelete = itemsToDelete.map((item) => item.id);
      await this.todoRepository.delete(idsToDelete);

      // Update progress
      job.deletedItems += itemsToDelete.length;
    }

    await this.deletionJobRepository.save(job);
  }

  private toInterface(job: DeletionJob): DeletionJobInterface {
    return {
      id: job.id,
      todoListId: job.todoListId,
      status: job.status,
      totalItems: job.totalItems,
      deletedItems: job.deletedItems,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }
}
