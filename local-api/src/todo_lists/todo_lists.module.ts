import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TodoListsController } from './todo_lists.controller';
import { TodoListsService } from './todo_lists.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodoList } from './todo_list.entity';
import { Todo } from '../todos/todo.entity';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DeletionJobsModule } from '../deletion_jobs/deletion_jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TodoList, Todo]),
    ClientsModule.registerAsync([
      {
        imports: [ConfigModule],
        name: 'DELETION_QUEUE',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>(
                'RABBITMQ_URL',
                'amqp://guest:guest@localhost:5672',
              ),
            ],
            queue: 'deletion_queue',
            queueOptions: {
              durable: true,
            },
          },
        }),
        inject: [ConfigService],
      },
      {
        imports: [ConfigModule],
        name: 'SYNC_QUEUE',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>(
                'RABBITMQ_URL',
                'amqp://guest:guest@localhost:5672',
              ),
            ],
            queue: 'sync_queue',
            queueOptions: {
              durable: true,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
    DeletionJobsModule,
  ],
  controllers: [TodoListsController],
  providers: [TodoListsService],
  exports: [TodoListsService],
})
export class TodoListsModule {}
