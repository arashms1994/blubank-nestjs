import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.enableShutdownHooks();
  await app.listen(config.get('PORT'), config.get('HOST'));
}
void bootstrap();
