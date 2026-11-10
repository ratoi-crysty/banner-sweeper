import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AgentStep, ToolCall, ToolResult } from '../types/agent.types';

export class ToolCallDto implements ToolCall {
  @ApiProperty({ example: 'tool_01' })
  id!: string;

  @ApiProperty({ description: 'Browser action the agent called.', example: 'click' })
  name!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { selector: '#reject-all' } })
  args!: Record<string, unknown>;
}

export class ToolResultDto implements ToolResult {
  @ApiProperty({ description: 'What the model was told. Screenshots are replaced by "[screenshot omitted]".' })
  text!: string;

  @ApiPropertyOptional({ description: 'Never set in API responses: screenshots are stripped.' })
  imageBase64?: string;

  @ApiPropertyOptional()
  isError?: boolean;
}

export class AgentStepDto implements AgentStep {
  @ApiProperty({ type: (): typeof ToolCallDto => ToolCallDto })
  call!: ToolCallDto;

  @ApiProperty({ type: (): typeof ToolResultDto => ToolResultDto })
  result!: ToolResultDto;
}
