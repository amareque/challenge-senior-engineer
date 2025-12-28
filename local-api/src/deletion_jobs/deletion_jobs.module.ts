import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionJob } from './deletion_job.entity';
import { DeletionJobsController } from './deletion_jobs.controller';
import { DeletionJobsService } from './deletion_jobs.service';
import { DeletionJobsConsumer } from './deletion_jobs.consumer';
import { Todo } from '../todos/todo.entity';
import { TodoList } from '../todo_lists/todo_list.entity';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeletionJob, Todo, TodoList]),
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
    ]),
  ],
  controllers: [DeletionJobsController, DeletionJobsConsumer],
  providers: [DeletionJobsService],
  exports: [DeletionJobsService],
})
export class DeletionJobsModule {}
