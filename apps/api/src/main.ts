import { config } from './config.js'; // first: checks the environment
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Checks request bodies and queries against the Zod schemas declared on
  // each controller method.
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  await app.listen(config.PORT);
}
await bootstrap();
