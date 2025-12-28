import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Todo } from './todo.entity';
import { TodoList } from '../todo_lists/todo_list.entity';
import { CreateTodoDto } from './dtos/create-todo';
import { UpdateTodoDto } from './dtos/update-todo';
import { Todo as TodoInterface } from '../interfaces/todo.interface';
import { ClientProxy } from '@nestjs/microservices';
import { SyncEventType } from '../interfaces/sync_event.interface';

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @InjectRepository(TodoList)
    private readonly todoListRepository: Repository<TodoList>,
    @Inject('SYNC_QUEUE') private readonly syncQueue: ClientProxy,
  ) {}

  async create(dto: CreateTodoDto): Promise<TodoInterface> {
    const todoList = await this.todoListRepository.findOneBy({
      id: dto.todoListId,
    });

    if (!todoList) {
      throw new NotFoundException(
        `TodoList with id ${dto.todoListId} not found`,
      );
    }

    const todo = this.todoRepository.create({
      title: dto.title,
      completed: false,
      todoList: todoList,
    });

    const savedTodo = await this.todoRepository.save(todo);
    
    // Emit sync event for creation
    this.syncQueue.emit('sync-event', {
      type: SyncEventType.CREATE_TODO_ITEM,
      payload: { id: savedTodo.id, todoListId: dto.todoListId },
    });
    
    return {
      id: savedTodo.id,
      title: savedTodo.title,
      completed: savedTodo.completed,
    };
  }

  async update(id: number, dto: UpdateTodoDto): Promise<TodoInterface> {
    const todo = await this.todoRepository.findOne({
      where: { id },
      relations: ['todoList'],
    });

    if (!todo) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }

    const updatedTodo = await this.todoRepository.save({ id, ...dto } as Todo);
    
    // Emit sync event for update
    this.syncQueue.emit('sync-event', {
      type: SyncEventType.UPDATE_TODO_ITEM,
      payload: { id: updatedTodo.id, todoListId: todo.todoList.id },
    });
    
    return {
      id: updatedTodo.id,
      title: updatedTodo.title,
      completed: updatedTodo.completed,
    };
  }

  async delete(id: number): Promise<void> {
    const todo = await this.todoRepository.findOne({
      where: { id },
      relations: ['todoList'],
    });

    if (!todo) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }

    const todoListId = todo.todoList.id;
    
    await this.todoRepository.delete(id);
    
    // Emit sync event for deletion
    this.syncQueue.emit('sync-event', {
      type: SyncEventType.DELETE_TODO_ITEM,
      payload: { id, todoListId },
    });
  }
}
