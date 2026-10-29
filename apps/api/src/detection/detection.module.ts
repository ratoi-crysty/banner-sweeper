import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationModule } from '../verification/verification.module';
import { DetectionJobEntity } from './detection-job.entity';
import { DetectionController } from './detection.controller';
import { DetectionQueue } from './detection-queue';
import { DetectionRunner } from './detection-runner';
import { DetectionService } from './detection.service';

@Module({
  imports: [TypeOrmModule.forFeature([DetectionJobEntity]), VerificationModule],
  controllers: [DetectionController],
  providers: [DetectionService, DetectionQueue, DetectionRunner],
})
export class DetectionModule {}
