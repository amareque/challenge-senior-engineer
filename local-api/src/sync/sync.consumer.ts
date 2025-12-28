import { Controller, Logger } from '@nestjs/common';
import {
  EventPattern,
  Payload,
  Ctx,
  RmqContext,
} from '@nestjs/microservices';
import { SyncService } from './sync.service';
import { SyncEvent } from '../interfaces/sync_event.interface';

@Controller()
export class SyncConsumer {
  private readonly logger = new Logger(SyncConsumer.name);

  constructor(private readonly syncService: SyncService) {}

  @EventPattern('sync-event')
  async handleSyncEvent(
    @Payload() event: SyncEvent,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.syncService.handleSyncEvent(event);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        `Error processing sync event ${event.type}:`,
        error.message,
      );
      // Acknowledge to prevent infinite retries
      // In production, you might want to implement retry logic or dead letter queue
      channel.ack(originalMsg);
    }
  }
}

