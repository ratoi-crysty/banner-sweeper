import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import type { ProviderType } from '../types/agent.types';
import { IsHttpUrl } from '../../../shared/validation';

export const PROVIDER_TYPES: readonly ProviderType[] = ['claude-agent-sdk', 'claude-api', 'ollama'];

/**
 * Flat shape of `ProviderConfig`. Fields that don't apply to the chosen `type`
 * (e.g. `host` for 'claude-api') are accepted and ignored by the provider factory.
 */
export class ProviderConfigDto {
  @ApiProperty({
    enum: PROVIDER_TYPES,
    enumName: 'ProviderType',
    description:
      '`claude-agent-sdk`: Claude via the Agent SDK, billed to the logged-in Claude plan. ' +
      '`claude-api`: Claude Messages API with ANTHROPIC_API_KEY. ' +
      '`ollama`: a local Ollama model with tool calling.',
  })
  @IsIn(PROVIDER_TYPES)
  type!: ProviderType;

  @ApiPropertyOptional({
    minLength: 1,
    description: "Model name. Default: the provider's default.",
    example: 'qwen3:8b',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: '`claude-api` only. Max output tokens per turn.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTokens?: number;

  @ApiPropertyOptional({
    format: 'uri',
    description: "`ollama` only. Default: the server's OLLAMA_HOST.",
    example: 'http://localhost:11434',
  })
  @IsOptional()
  @IsHttpUrl()
  host?: string;

  @ApiPropertyOptional({ description: '`ollama` only. Send screenshots to the model (needs a vision model).' })
  @IsOptional()
  @IsBoolean()
  vision?: boolean;
}
