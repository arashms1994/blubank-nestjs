import type { IncomingMessage } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';

import { RequestMethod, VersioningType } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { getRequestId } from './common/request-id';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.schema';
import { getPinoOptions } from './config/logging';

async function bootstrap() {
  const configModule = await ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
    validate: validateEnv,
  });
  const configContext = await NestFactory.createApplicationContext(configModule, { logger: false });
  const initialConfig = configContext.get<ConfigService<Env, true>>(ConfigService);
  const adapter = new FastifyAdapter({
    // Only explicitly trusted proxies can supply the forwarded address used as request.ip.
    trustProxy: initialConfig.get('TRUST_PROXY'),
    bodyLimit: initialConfig.get('BODY_LIMIT_BYTES'),
    logger: getPinoOptions({
      NODE_ENV: initialConfig.get('NODE_ENV'),
      LOG_LEVEL: initialConfig.get('LOG_LEVEL'),
    }),
    genReqId: (request: IncomingMessage | Http2ServerRequest) => getRequestId(request.headers),
  });
  await configContext.close();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const healthRoute = [{ path: 'health', method: RequestMethod.GET }];

  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.flushLogs();
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      reply.header('x-request-id', request.id);
      done();
    });
  app.setGlobalPrefix('api', { exclude: healthRoute });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableCors({ origin: config.get('CORS_ORIGINS') });

  if (config.get('NODE_ENV') === 'development') {
    const swaggerConfig = new DocumentBuilder().setTitle('Blue Bank API').setVersion('1.0').build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
      deepScanRoutes: true,
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
    });

    SwaggerModule.setup('swagger', app, swaggerDocument, {
      jsonDocumentUrl: 'swagger-json',
      yamlDocumentUrl: 'swagger-yaml',
      swaggerOptions: {
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
        tryItOutEnabled: true,
      },
    });
  }

  await app.listen(config.get('PORT'), config.get('HOST'), () => {
    logger.log(`Application is running on port: ${config.get('PORT')}`, 'Bootstrap');
  });
}
void bootstrap();
