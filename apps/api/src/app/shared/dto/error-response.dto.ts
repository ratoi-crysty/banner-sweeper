import { ApiProperty } from '@nestjs/swagger';

/** Nest's default HttpException body. */
export class ErrorResponseDto {
  @ApiProperty({ type: 'integer', example: 400 })
  statusCode!: number;

  @ApiProperty({
    description: 'One message, or one per failed field for validation errors.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['url must be an absolute http(s) URL'],
  })
  message!: string | string[];

  @ApiProperty({ required: false, example: 'Bad Request' })
  error?: string;
}
