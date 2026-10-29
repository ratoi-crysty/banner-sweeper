import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const GLOBAL_PREFIX = 'api';

/** The app-wide setup, shared by `main.ts` and the HTTP tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();

  const config: Omit<OpenAPIObject, 'paths'> = new DocumentBuilder()
    .setTitle('Banner Sweeper API')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, () =>
    SwaggerModule.createDocument(app, config),
  );
}
