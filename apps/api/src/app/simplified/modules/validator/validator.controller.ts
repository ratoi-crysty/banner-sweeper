import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto';
import { ValidateRuleRequestDto } from './dto/validate-rule-request.dto';
import { ValidationResultDto } from './dto/validation-result.dto';
import type { ValidationResult } from './types';
import { ValidatorService } from './validator.service';

@ApiTags('validate')
@Controller('rules')
export class ValidatorController {
  constructor(private readonly validator: ValidatorService) {}

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Validate an autoconsent rule against a live page',
    description:
      'Loads the URL in a fresh browser context, runs the real autoconsent content script with only this rule, ' +
      'and checks independently that the banner is gone after opt-out. Works for generated and hand-written rules. ' +
      'A rule that fails still returns 200 with `passed: false`.',
  })
  @ApiOkResponse({ type: ValidationResultDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid request body.' })
  validate(@Body() body: ValidateRuleRequestDto): Promise<ValidationResult> {
    return this.validator.validate(body);
  }
}
