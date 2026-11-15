import { Global, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Env } from '../../config/env.schema.js';
import { InjectRedis, REDIS_CLIENT } from './redis.constants.js';
import { RedisService } from './redis.service.js';

@Injectable()
class RedisConnectionLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisConnectionLifecycle.name);

  constructor(@InjectRedis() private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'end' || this.client.status === 'close') {
      this.client.disconnect();
      return;
    }

    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn('Redis QUIT failed; disconnecting the client');
      this.client.disconnect();
      if (error instanceof Error) {
        this.logger.error(`Redis shutdown error: ${error.message}`, error.stack);
      }
    }
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis({
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD'),
          db: config.get('REDIS_DB'),
          keyPrefix: config.get('REDIS_KEY_PREFIX'),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(50 * 2 ** (times - 1), 2_000),
        });

        client.on('connect', () => logger.log('Redis connected'));
        client.on('ready', () => logger.log('Redis ready'));
        client.on('error', (error: Error) =>
          logger.error(`Redis error: ${error.message}`, error.stack),
        );
        client.on('close', () => logger.warn('Redis connection closed'));
        client.on('reconnecting', (delay: number) =>
          logger.warn(`Redis reconnecting in ${delay}ms`),
        );

        return client;
      },
    },
    RedisService,
    RedisConnectionLifecycle,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
