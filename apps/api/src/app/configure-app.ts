import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { version } from '../../package.json';

export const GLOBAL_PREFIX = 'api';
// SwaggerModule ignores the global prefix, so the path includes it
export const DOCS_PATH = `${GLOBAL_PREFIX}/docs`;

/** The app-wide setup, shared by `main.ts` and the HTTP tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();

  const config: Omit<OpenAPIObject, 'paths'> = new DocumentBuilder()
    .setTitle('Banner Sweeper API')
    .setVersion(version)
    .build();
  SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, config));
}
