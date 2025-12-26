import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Todo } from './todo.entity';
import { TodoList } from '../todo_lists/todo_list.entity';
import { CreateTodoDto } from './dtos/create-todo';
import { UpdateTodoDto } from './dtos/update-todo';
import { Todo as TodoInterface } from '../interfaces/todo.interface';

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @InjectRepository(TodoList)
    private readonly todoListRepository: Repository<TodoList>,
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
    return {
      id: savedTodo.id,
      title: savedTodo.title,
      completed: savedTodo.completed,
    };
  }

  async update(id: number, dto: UpdateTodoDto): Promise<TodoInterface> {
    const todo = await this.todoRepository.findOneBy({ id });

    if (!todo) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }

    const updatedTodo = await this.todoRepository.save({ id, ...dto } as Todo);
    return {
      id: updatedTodo.id,
      title: updatedTodo.title,
      completed: updatedTodo.completed,
    };
  }

  async delete(id: number): Promise<void> {
    const todo = await this.todoRepository.findOneBy({ id });

    if (!todo) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }

    await this.todoRepository.delete(id);
  }
}
