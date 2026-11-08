import { DynamicModule, InjectionToken, Module, type ModuleMetadata, OptionalFactoryDependency } from '@nestjs/common';
import { PLAYWRIGHT_OPTIONS } from './playwright.constants';
import { PlaywrightService } from './playwright.service';
import type { PlaywrightModuleOptions } from './types';

export interface PlaywrightModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  useFactory: (...args: unknown[]) => PlaywrightModuleOptions | Promise<PlaywrightModuleOptions>;
}

/** Global: register once in the root module, inject PlaywrightService anywhere. */
@Module({})
export class PlaywrightModule {
  static forRoot(options: PlaywrightModuleOptions): DynamicModule {
    return {
      module: PlaywrightModule,
      global: true,
      providers: [{ provide: PLAYWRIGHT_OPTIONS, useValue: options }, PlaywrightService],
      exports: [PlaywrightService],
    };
  }

  static forRootAsync(options: PlaywrightModuleAsyncOptions): DynamicModule {
    return {
      module: PlaywrightModule,
      global: true,
      imports: options.imports ?? [],
      providers: [{ provide: PLAYWRIGHT_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] }, PlaywrightService],
      exports: [PlaywrightService],
    };
  }
}
