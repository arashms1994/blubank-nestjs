import { RequestMethod, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const configContext = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const initialConfig = configContext.get<ConfigService<Env, true>>(ConfigService);
  const adapter = new FastifyAdapter({
    // trustProxy controls whether forwarded headers are trusted when Fastify determines request.ip.
    trustProxy: initialConfig.get('TRUST_PROXY'),
    bodyLimit: initialConfig.get('BODY_LIMIT_BYTES'),
  });
  await configContext.close();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const healthRoute = [{ path: 'health', method: RequestMethod.GET }];

  app.enableShutdownHooks();
  app.setGlobalPrefix('api', { exclude: healthRoute });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableCors({ origin: config.get('CORS_ORIGINS') });

  await app.listen(config.get('PORT'), config.get('HOST'), () => {
    console.log(`application is running on ${config.get('PORT')}`);
  });
}
void bootstrap();
