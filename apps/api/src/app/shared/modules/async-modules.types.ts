import { ModuleMetadata } from '@nestjs/common/interfaces/modules/module-metadata.interface';
import { InjectionToken, OptionalFactoryDependency } from '@nestjs/common';

export interface AsyncModuleOptions<T> extends Pick<ModuleMetadata, 'imports'> {
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => T | Promise<T>;
}
