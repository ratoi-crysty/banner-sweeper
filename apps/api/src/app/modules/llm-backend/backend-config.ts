// class-transformer's `@Type` reads design-time metadata; Nest loads this too, but the config is also used without Nest
import 'reflect-metadata';
import type { Pricing } from '@banner-sweeper/llm-backend';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Min,
  Validate,
  ValidateNested,
} from 'class-validator';
import { UniqueBackendIdsConstraint } from './unique-backend-ids.constraint';

export const BACKEND_KINDS = ['claude', 'anthropicCompatible'] as const;
export type BackendKind = (typeof BACKEND_KINDS)[number];

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export class PricingConfig implements Pricing {
  @IsNumber()
  @Min(0)
  inputPerMTok!: number;

  @IsNumber()
  @Min(0)
  outputPerMTok!: number;

  @IsNumber()
  @Min(0)
  cacheReadPerMTok!: number;

  @IsNumber()
  @Min(0)
  cacheWritePerMTok!: number;
}

export class ContextPolicyConfig {
  @IsInt()
  @Min(0)
  keepScreenshots!: number;
}

/** One entry of `apps/api/config/llm-backends.json`. It holds no secrets: `apiKeyEnv` names an env var. */
export class BackendEntry {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsIn(BACKEND_KINDS)
  kind!: BackendKind;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  baseURL?: string;

  /** The env var holding the API key. Without it, the SDK resolves credentials itself. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKeyEnv?: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsOptional()
  @IsIn(EFFORTS)
  effort?: Effort;

  @IsInt()
  @IsPositive()
  maxTokens!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PricingConfig)
  pricing?: PricingConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContextPolicyConfig)
  contextPolicy?: ContextPolicyConfig;
}

export class BackendConfig {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BackendEntry)
  @Validate(UniqueBackendIdsConstraint)
  backends!: BackendEntry[];
}
