import { Module } from '@nestjs/common';
import { RunnerModule } from '../runner';
import { ValidatorController } from './validator.controller';
import { ValidatorService } from './validator.service';

@Module({
  imports: [RunnerModule],
  controllers: [ValidatorController],
  providers: [ValidatorService],
  exports: [ValidatorService],
})
export class ValidatorModule {}
