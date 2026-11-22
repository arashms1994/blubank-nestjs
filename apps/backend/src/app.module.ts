import { type ExecutionContext, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants.js';
import type Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';

import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { REDIS_CLIENT } from './common/redis/redis.constants.js';
import { RedisModule } from './common/redis/redis.module.js';
import { HttpThrottlerGuard } from './common/throttling/http-throttler.guard.js';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler.storage.js';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.schema';
import { getPinoOptions } from './config/logging';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: getPinoOptions({
          NODE_ENV: config.get('NODE_ENV'),
          LOG_LEVEL: config.get('LOG_LEVEL'),
        }),
        useExisting: true,
      }),
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT, Reflector],
      useFactory: (redis: Redis, reflector: Reflector) => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: ['default', 'short', 'long'].map((name) => ({
          name,
          // The guard skips this entry unless the decorator supplies both values.
          limit: 0,
          ttl: 0,
          skipIf: (context: ExecutionContext) => {
            const targets = [context.getHandler(), context.getClass()];
            return (
              reflector.getAllAndOverride<unknown>(THROTTLER_LIMIT + name, targets) === undefined ||
              reflector.getAllAndOverride<unknown>(THROTTLER_TTL + name, targets) === undefined
            );
          },
        })),
      }),
    }),
    EnrollmentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule {}
