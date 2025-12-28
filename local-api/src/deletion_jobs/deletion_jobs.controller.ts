import { Controller, Get, Param } from '@nestjs/common';
import { DeletionJobsService } from './deletion_jobs.service';
import { DeletionJob } from '../interfaces/deletion_job.interface';

@Controller('api/deletion-jobs')
export class DeletionJobsController {
  constructor(private deletionJobsService: DeletionJobsService) {}

  @Get('/:jobId')
  getJob(@Param() param: { jobId: number }): Promise<DeletionJob> {
    return this.deletionJobsService.get(param.jobId);
  }

  @Get()
  getAllJobs(): Promise<DeletionJob[]> {
    return this.deletionJobsService.all();
  }
}
