import { Module } from '@nestjs/common';
import { RunnerService } from './runner.service';

/** Requires PlaywrightModule.forRoot(...) (global) in the root module. */
@Module({
  providers: [RunnerService],
  exports: [RunnerService],
})
export class RunnerModule {}
