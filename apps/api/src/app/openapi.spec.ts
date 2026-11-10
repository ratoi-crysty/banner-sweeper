import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test, type TestingModule } from '@nestjs/testing';
import { GenerateController } from './modules/generate/generate.controller';
import { GenerationJobsService } from './modules/generate';
import { ValidatorController } from './modules/validator/validator.controller';
import { ValidatorService } from './modules/validator';
import { createOpenApiDocument } from './openapi';

interface Operation {
  summary?: string;
  tags?: string[];
  responses: Record<string, unknown>;
}

describe('OpenAPI document', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [GenerateController, ValidatorController],
      providers: [
        { provide: GenerationJobsService, useValue: {} },
        { provide: ValidatorService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    document = createOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves every $ref to a component schema', () => {
    const refs: string[] = [];
    JSON.stringify(document, (key: string, value: unknown): unknown => {
      if (key === '$ref' && typeof value === 'string') refs.push(value);
      return value;
    });
    const schemas: Record<string, unknown> = document.components?.schemas ?? {};
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((ref: string): boolean => !(ref.replace('#/components/schemas/', '') in schemas))).toEqual([]);
  });

  it('documents every route with a summary, a tag and a success response', () => {
    const paths: Record<string, Record<string, Operation>> = document.paths as Record<
      string,
      Record<string, Operation>
    >;
    const operations: [string, Operation][] = Object.entries(paths).flatMap(
      ([path, item]: [string, Record<string, Operation>]): [string, Operation][] =>
        Object.entries(item).map(([method, op]: [string, Operation]): [string, Operation] => [
          `${method.toUpperCase()} ${path}`,
          op,
        ]),
    );
    expect(operations.map(([name]: [string, Operation]): string => name).sort()).toEqual([
      'DELETE /api/rules/generate/{id}',
      'GET /api/rules/generate',
      'GET /api/rules/generate/{id}',
      'GET /api/rules/generate/{id}/events',
      'POST /api/rules/generate',
      'POST /api/rules/validate',
    ]);
    for (const [name, op] of operations) {
      expect({ name, summary: Boolean(op.summary), tagged: Boolean(op.tags?.length) }).toEqual({
        name,
        summary: true,
        tagged: true,
      });
      expect(Object.keys(op.responses).some((code: string): boolean => code.startsWith('2'))).toBe(true);
    }
  });

  it('describes the generation result as a union on status', () => {
    const job: {
      properties: Record<string, { discriminator?: { propertyName: string; mapping: Record<string, string> } }>;
    } = document.components?.schemas?.['GenerationJobDto'] as never;
    expect(job.properties['result']?.discriminator?.propertyName).toBe('status');
    expect(Object.keys(job.properties['result']?.discriminator?.mapping ?? {}).sort()).toEqual([
      'blocked',
      'cancelled',
      'covered-by-bundled-rule',
      'failed',
      'generated',
      'no-banner',
    ]);
  });
});
