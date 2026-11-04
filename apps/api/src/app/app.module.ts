import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiConfig } from '../config/api.config';
import { DatabaseModule } from './modules/database/database.module';
import { DetectionModule } from './modules/detection/detection.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [apiConfig] }), DatabaseModule, DetectionModule],
})
export class AppModule {}
