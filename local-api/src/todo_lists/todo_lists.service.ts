import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CreateTodoListDto } from './dtos/create-todo_list';
import { UpdateTodoListDto } from './dtos/update-todo_list';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TodoList } from './todo_list.entity';
import { Todo } from '../todos/todo.entity';
import { TodoList as TodoListInterface } from '../interfaces/todo_list.interface';
import { Todo as TodoInterface } from '../interfaces/todo.interface';
import { ClientProxy } from '@nestjs/microservices';
import { DeletionJobsService } from '../deletion_jobs/deletion_jobs.service';
import { DeletionJob } from '../interfaces/deletion_job.interface';
import { SyncEventType } from '../interfaces/sync_event.interface';

@Injectable()
export class TodoListsService {
  constructor(
    @InjectRepository(TodoList)
    private readonly todoListRepository: Repository<TodoList>,
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @Inject('DELETION_QUEUE') private readonly deletionQueue: ClientProxy,
    @Inject('SYNC_QUEUE') private readonly syncQueue: ClientProxy,
    private readonly deletionJobsService: DeletionJobsService,
  ) {}

  async all(): Promise<TodoListInterface[]> {
    const todoLists = await this.todoListRepository.find({
      relations: ['todos'],
    });
    return todoLists.map((todoList) => ({
      id: todoList.id,
      name: todoList.name,
      todos: (todoList.todos || []).map(
        (todo) =>
          ({
            id: todo.id,
            title: todo.title,
            completed: todo.completed,
          }) as TodoInterface,
      ),
    }));
  }

  async get(id: number): Promise<TodoListInterface> {
    const todoList = await this.todoListRepository.findOne({
      where: { id },
      relations: ['todos'],
    });

    if (!todoList) {
      throw new NotFoundException(`TodoList with id ${id} not found`);
    }

    return {
      id: todoList.id,
      name: todoList.name,
      todos: (todoList.todos || []).map(
        (todo) =>
          ({
            id: todo.id,
            title: todo.title,
            completed: todo.completed,
          }) as TodoInterface,
      ),
    };
  }

  async create(dto: CreateTodoListDto): Promise<TodoListInterface> {
    const todoList = this.todoListRepository.create({ name: dto.name });
    const savedTodoList = await this.todoListRepository.save(todoList);
    
    // Emit sync event for creation
    this.syncQueue.emit('sync-event', {
      type: SyncEventType.CREATE_TODO_LIST,
      payload: { id: savedTodoList.id },
    });
    
    return {
      id: savedTodoList.id,
      name: savedTodoList.name,
      todos: [],
    };
  }

  async update(id: number, dto: UpdateTodoListDto): Promise<TodoListInterface> {
    const updatedTodoList = await this.todoListRepository.save({
      id,
      ...dto,
    } as TodoList);
    
    // Emit sync event for update
    this.syncQueue.emit('sync-event', {
      type: SyncEventType.UPDATE_TODO_LIST,
      payload: { id: updatedTodoList.id },
    });
    
    return await this.get(updatedTodoList.id);
  }

  async delete(id: number): Promise<DeletionJob> {
    const todoList = await this.todoListRepository.findOneBy({ id });

    if (!todoList) {
      throw new NotFoundException(`TodoList with id ${id} not found`);
    }

    // Emit sync event for deletion
    this.syncQueue.emit('sync-event', {
      type: SyncEventType.DELETE_TODO_LIST,
      payload: { id },
    });

    // Create a deletion job
    const job = await this.deletionJobsService.create(id);

    // Send a job to RabbitMQ queue
    this.deletionQueue.emit('deletion-job', { jobId: job.id });

    return job;
  }

  async completeAll(id: number): Promise<TodoListInterface> {
    const todoList = await this.todoListRepository.findOneBy({ id });

    if (!todoList) {
      throw new NotFoundException(`TodoList with id ${id} not found`);
    }

    await this.todoRepository
      .createQueryBuilder()
      .update(Todo)
      .set({ completed: true })
      .where('todo_list_id = :id', { id })
      .execute();

    return await this.get(id);
  }
}
