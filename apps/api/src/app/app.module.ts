import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiConfig } from './api-config';
import { DatabaseModule } from './database/database.module';
import { DetectionModule } from './detection/detection.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [apiConfig] }),
    DatabaseModule,
    DetectionModule,
  ],
})
export class AppModule {}
