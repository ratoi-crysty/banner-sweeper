import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DetectionModule } from '../detection/detection.module';
import { ConfigModule } from './config.module';

@Module({
  imports: [ConfigModule, DatabaseModule, DetectionModule],
})
export class AppModule {}
