import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Todo } from '../todos/todo.entity';

@Entity()
export class TodoList {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true })
  external_id: string | null;

  @Column()
  name: string;

  @OneToMany(() => Todo, (todo) => todo.todoList)
  todos: Todo[];
}
