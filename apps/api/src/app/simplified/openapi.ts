import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Served under the global prefix: Swagger UI at `/<prefix>/docs`, the JSON document at `/<prefix>/docs-json`. */
export const OPENAPI_PATH = 'docs';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config: Omit<OpenAPIObject, 'paths'> = new DocumentBuilder()
    .setTitle('Consent rule agent API')
    .setDescription(
      'Generates [autoconsent](https://github.com/duckduckgo/autoconsent) rules for cookie-consent banners with an LLM agent ' +
        'driving a real browser, and validates rules against live pages.',
    )
    .setVersion('0.0.1')
    .addTag('generate', 'Background jobs that write a new rule for a site.')
    .addTag('validate', 'Run a rule against a live page.')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup(OPENAPI_PATH, app, (): OpenAPIObject => createOpenApiDocument(app), { useGlobalPrefix: true });
}
