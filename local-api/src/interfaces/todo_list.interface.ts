import { Todo } from './todo.interface';

export interface TodoList {
  id: number;
  name: string;
  todos: Todo[];
}
