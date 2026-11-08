import { DynamicModule, Module } from '@nestjs/common';
import { RunnerModule } from '../runner';
import { ValidatorModule } from '../validator';
import { DEFAULT_GENERATE_OPTIONS, GENERATE_OPTIONS, type GenerateModuleOptions } from './generate.constants';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';
import { GenerationJobsService } from './generation-jobs.service';

/**
 * Glue module. Requires the global PlaywrightModule.forRoot(...) and AgentModule.forRoot(...)
 * in the root module; brings in Runner and Validator itself.
 */
@Module({})
export class GenerateModule {
  static register(options: Partial<GenerateModuleOptions> = {}): DynamicModule {
    return {
      module: GenerateModule,
      imports: [RunnerModule, ValidatorModule],
      controllers: [GenerateController],
      providers: [{ provide: GENERATE_OPTIONS, useValue: withDefaults(options) }, GenerateService, GenerationJobsService],
      exports: [GenerateService, GenerationJobsService],
    };
  }
}

/** Undefined values (e.g. from unset env vars) must not override the defaults. */
function withDefaults(options: Partial<GenerateModuleOptions>): GenerateModuleOptions {
  const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
  return { ...DEFAULT_GENERATE_OPTIONS, ...defined };
}
