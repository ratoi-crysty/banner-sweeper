import { DynamicModule, Module } from '@nestjs/common';
import { PLAYWRIGHT_OPTIONS } from './playwright.constants';
import { PlaywrightService } from './playwright.service';
import type { PlaywrightModuleOptions } from './types/playwright.types';
import { AsyncModuleOptions } from '../../shared/modules/async-modules.types';

export type PlaywrightModuleAsyncOptions = AsyncModuleOptions<PlaywrightModuleOptions>;

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
      providers: [
        { provide: PLAYWRIGHT_OPTIONS, useFactory: options.useFactory, inject: options.inject },
        PlaywrightService,
      ],
      exports: [PlaywrightService],
    };
  }
}
