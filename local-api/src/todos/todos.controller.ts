import { Controller, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { CreateTodoDto } from './dtos/create-todo';
import { UpdateTodoDto } from './dtos/update-todo';
import { Todo } from '../interfaces/todo.interface';
import { TodosService } from './todos.service';

@Controller('api/todos')
export class TodosController {
  constructor(private todosService: TodosService) {}

  @Post()
  create(@Body() dto: CreateTodoDto): Promise<Todo> {
    return this.todosService.create(dto);
  }

  @Put('/:todoId')
  update(
    @Param() param: { todoId: string },
    @Body() dto: UpdateTodoDto,
  ): Promise<Todo> {
    return this.todosService.update(Number(param.todoId), dto);
  }

  @Delete('/:todoId')
  delete(@Param() param: { todoId: number }): Promise<void> {
    return this.todosService.delete(param.todoId);
  }
}
