import { createHash, randomUUID } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { minutes, seconds, Throttle } from '@nestjs/throttler';
import type Redis from 'ioredis';

import { AppModule } from '../src/app.module.js';
import type { ApiErrorResponse } from '../src/common/api-response.js';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants.js';
import { type Env, validateEnv } from '../src/config/env.schema.js';

@Controller('throttle-test')
class ThrottleTestController {
  @Get('first')
  @Throttle({ short: { limit: 10, ttl: seconds(10) }, long: { limit: 100, ttl: minutes(1) } })
  first() {
    return { ok: true };
  }

  @Get('second')
  @Throttle({ default: { limit: 2, ttl: seconds(20) } })
  second() {
    return { ok: true };
  }

  @Get('open')
  open() {
    return { ok: true };
  }
}

describe('Redis throttling (e2e)', () => {
  const apps: NestFastifyApplication[] = [];
  let appA: NestFastifyApplication;
  let appB: NestFastifyApplication;

  async function boot(config: ConfigService<Env, true>): Promise<NestFastifyApplication> {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThrottleTestController],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    const app = fixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: config.get('TRUST_PROXY') }),
      { logger: false },
    );
    apps.push(app);
    await app.init();
    await app.get<Redis>(REDIS_CLIENT).ping();

    return app;
  }

  beforeAll(async () => {
    const config = new ConfigService<Env, true>(
      validateEnv({
        ...process.env,
        REDIS_KEY_PREFIX: `blubank:e2e:${randomUUID()}:`,
        TRUST_PROXY: 'loopback',
      }),
    );
    appA = await boot(config);
    appB = await boot(config);
  }, 15_000);

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  function get(app: NestFastifyApplication, url: string, ip: string) {
    return app.inject({ url, remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': ip } });
  }

  function bucket(ip: string, name: 'short' | 'long'): string {
    const key = createHash('sha256')
      .update(`ThrottleTestController-first-${name}-${ip}`)
      .digest('hex');
    return `throttle:{${name}:${key}}`;
  }

  it('shares a route limit across instances, returns the API 429, and keeps routes independent', async () => {
    const ip = '198.51.100.10';
    for (let index = 0; index < 6; index++) {
      const response = await get(appA, '/throttle-test/first', ip);
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-remaining-short']).toBe(String(9 - index));
    }
    for (let index = 0; index < 4; index++) {
      const response = await get(appB, '/throttle-test/first', ip);
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-remaining-short']).toBe(String(3 - index));
      expect(response.headers['x-ratelimit-limit-long']).toBe('100');
    }

    const blocked = await get(appB, '/throttle-test/first', ip);
    expect(blocked.statusCode).toBe(429);
    const body = blocked.json<ApiErrorResponse>();
    expect(body).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
      meta: { path: '/throttle-test/first' },
    });
    expect(body.error.message).toMatch(/تعداد درخواست‌ها/);
    expect(body.meta.requestId).toMatch(/.+/);
    expect(body.meta.timestamp).toMatch(/^\d{4}-/);
    expect(blocked.headers['retry-after']).toMatch(/^[1-9]\d*$/);
    expect(blocked.headers['retry-after-short']).toBe(blocked.headers['retry-after']);
    expect(blocked.headers['x-ratelimit-limit']).toBe('10');
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
    expect(blocked.headers['x-ratelimit-reset']).toBe(blocked.headers['retry-after']);
    expect((await get(appA, '/throttle-test/first', ip)).statusCode).toBe(429);

    const otherRoute = await get(appB, '/throttle-test/second', ip);
    expect(otherRoute.statusCode).toBe(200);
    expect(otherRoute.headers['x-ratelimit-limit']).toBe('2');
    expect(otherRoute.headers['x-ratelimit-remaining']).toBe('1');
    expect(otherRoute.headers['x-ratelimit-limit-short']).toBeUndefined();
    expect(otherRoute.headers['x-ratelimit-limit-long']).toBeUndefined();
    expect((await get(appA, '/throttle-test/second', ip)).statusCode).toBe(200);
    expect((await get(appB, '/throttle-test/second', ip)).statusCode).toBe(429);

    const anotherIp = await get(appB, '/throttle-test/first', '198.51.100.11');
    expect(anotherIp.statusCode).toBe(200);
    expect(anotherIp.headers['x-ratelimit-remaining-short']).toBe('9');
  });

  it('skips Redis and rate limit headers for routes without the decorator', async () => {
    const evalSpy = jest.spyOn(appB.get<Redis>(REDIS_CLIENT), 'eval');
    try {
      for (const route of ['/health', '/throttle-test/open']) {
        for (let index = 0; index < 12; index++) {
          const response = await get(appB, route, '198.51.100.12');
          expect(response.statusCode).toBe(200);
          expect(response.headers['x-ratelimit-limit']).toBeUndefined();
          expect(response.headers['x-ratelimit-limit-short']).toBeUndefined();
          expect(response.headers['x-ratelimit-limit-long']).toBeUndefined();
        }
      }
      expect(evalSpy).not.toHaveBeenCalled();
    } finally {
      evalSpy.mockRestore();
    }
  });

  it('repairs a counter without a TTL and preserves its existing hits', async () => {
    const ip = '198.51.100.13';
    const redis = appA.get<Redis>(REDIS_CLIENT);
    const hitsKey = `${bucket(ip, 'short')}:hits`;
    await redis.set(hitsKey, 3);

    const response = await get(appB, '/throttle-test/first', ip);
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-remaining-short']).toBe('6');
    const ttl = await redis.pttl(hitsKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10_000);
  });

  it('keeps blocking after the counter expires and starts a fresh window after the block expires', async () => {
    const ip = '198.51.100.14';
    const redis = appA.get<Redis>(REDIS_CLIENT);
    const short = bucket(ip, 'short');
    const hitsKey = `${short}:hits`;
    const blockKey = `${short}:block`;
    await redis.set(hitsKey, 10, 'PX', 10_000);
    expect((await get(appA, '/throttle-test/first', ip)).statusCode).toBe(429);

    // Advance each key to its expiry without waiting for wall-clock time.
    expect(await redis.pexpireat(hitsKey, 1)).toBe(1);
    expect((await get(appB, '/throttle-test/first', ip)).statusCode).toBe(429);
    expect(await redis.exists(hitsKey)).toBe(0);

    expect(await redis.pexpireat(blockKey, 1)).toBe(1);
    const recovered = await get(appB, '/throttle-test/first', ip);
    expect(recovered.statusCode).toBe(200);
    expect(recovered.headers['x-ratelimit-remaining-short']).toBe('9');
    expect(await redis.get(hitsKey)).toBe('1');
  });

  it('blocks on the 101st hit of the long window while short still has capacity', async () => {
    const ip = '198.51.100.15';
    const redis = appA.get<Redis>(REDIS_CLIENT);
    await redis.set(`${bucket(ip, 'long')}:hits`, 99, 'PX', 60_000);

    const allowed = await get(appA, '/throttle-test/first', ip);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['x-ratelimit-remaining-long']).toBe('0');

    const blocked = await get(appB, '/throttle-test/first', ip);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<ApiErrorResponse>().error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['x-ratelimit-remaining-short']).toBe('8');
    expect(blocked.headers['x-ratelimit-limit']).toBe('100');
    expect(blocked.headers['retry-after-long']).toBe('60');
  });
});
