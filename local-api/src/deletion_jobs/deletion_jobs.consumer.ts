import { Controller, Inject } from '@nestjs/common';
import {
  EventPattern,
  Payload,
  Ctx,
  RmqContext,
  ClientProxy,
} from '@nestjs/microservices';
import { DeletionJobsService } from './deletion_jobs.service';
import { DeletionJobStatus } from '../interfaces/deletion_job.interface';

@Controller()
export class DeletionJobsConsumer {
  constructor(
    private readonly deletionJobsService: DeletionJobsService,
    @Inject('DELETION_QUEUE') private readonly deletionQueue: ClientProxy,
  ) {}

  @EventPattern('deletion-job')
  async handleDeletionJob(
    @Payload() data: { jobId: number },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const job = await this.deletionJobsService.get(data.jobId);

      // Only process if job is pending or processing
      if (
        job.status === DeletionJobStatus.PENDING ||
        job.status === DeletionJobStatus.PROCESSING
      ) {
        // Process deletion (10 items at a time)
        await this.deletionJobsService.processDeletion(data.jobId);

        // Check if job is completed
        const updatedJob = await this.deletionJobsService.get(data.jobId);

        // Acknowledge the current message
        channel.ack(originalMsg);

        if (updatedJob.status !== DeletionJobStatus.COMPLETED) {
          // Job not completed yet, requeue for next batch
          // Use a small delay to prevent immediate reprocessing
          setTimeout(() => {
            this.deletionQueue.emit('deletion-job', { jobId: data.jobId });
          }, 100);
        }
      } else {
        // Job already completed or failed, just acknowledge
        channel.ack(originalMsg);
      }
    } catch (error) {
      console.error('Error processing deletion job:', error);
      // Acknowledge to prevent infinite retries
      channel.ack(originalMsg);
    }
  }
}
