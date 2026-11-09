import { DynamicModule, InjectionToken, Module, type ModuleMetadata, OptionalFactoryDependency } from '@nestjs/common';
import { AGENT_OPTIONS } from './agent.constants';
import { AgentService } from './agent.service';
import { AgentProviderFactory } from './agent-provider.factory';
import type { AgentModuleOptions } from './types/agent.types';

export interface AgentModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  useFactory: (...args: unknown[]) => AgentModuleOptions | Promise<AgentModuleOptions>;
}

/** Global: register once in the root module, inject AgentService anywhere. */
@Module({})
export class AgentModule {
  static forRoot(options: AgentModuleOptions): DynamicModule {
    return {
      module: AgentModule,
      global: true,
      providers: [{ provide: AGENT_OPTIONS, useValue: options }, AgentProviderFactory, AgentService],
      exports: [AgentService, AgentProviderFactory],
    };
  }

  static forRootAsync(options: AgentModuleAsyncOptions): DynamicModule {
    return {
      module: AgentModule,
      global: true,
      imports: options.imports ?? [],
      providers: [{ provide: AGENT_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] }, AgentProviderFactory, AgentService],
      exports: [AgentService, AgentProviderFactory],
    };
  }
}
