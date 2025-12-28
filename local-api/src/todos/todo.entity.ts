import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TodoList } from '../todo_lists/todo_list.entity';

@Entity()
export class Todo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  external_id: string | null;

  @Column()
  title: string;

  @Column()
  completed: boolean;

  @ManyToOne(() => TodoList, (todoList) => todoList.todos)
  @JoinColumn({ name: 'todo_list_id' })
  todoList: TodoList;
}
