import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { SyncConsumer } from './sync.consumer';
import { SyncScheduler } from './sync.scheduler';
import { TodoList } from '../todo_lists/todo_list.entity';
import { Todo } from '../todos/todo.entity';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    TypeOrmModule.forFeature([TodoList, Todo]),
    ClientsModule.registerAsync([
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
  ],
  controllers: [SyncConsumer],
  providers: [SyncService, SyncScheduler],
  exports: [SyncService],
})
export class SyncModule {}

