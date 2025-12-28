import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncService } from './sync.service';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(private readonly syncService: SyncService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleSyncFromExternal() {
    this.logger.log('Running scheduled sync from external API...');
    try {
      await this.syncService.syncFromExternal();
    } catch (error) {
      this.logger.error('Error in scheduled sync from external API:', error);
    }
  }
}

