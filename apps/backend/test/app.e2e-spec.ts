import type { IncomingMessage } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { z } from 'zod';

import { AppModule } from './../src/app.module';
import { AppException } from './../src/common/app-exception';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { getRequestId } from './../src/common/request-id';
import { ZodValidationPipe } from './../src/common/zod-validation.pipe';
import type { Env } from './../src/config/env.schema';
import { getPinoOptions } from './../src/config/logging';

@Controller({ path: 'test', version: '1' })
class E2eController {
  @Post('body')
  validateBody(
    @Body(new ZodValidationPipe(z.object({ count: z.coerce.number().int().positive() })))
    body: {
      count: number;
    },
  ) {
    return body;
  }

  @Get('app-error')
  throwAppException(): never {
    throw new AppException('TEST_FAILURE', HttpStatus.CONFLICT, 'Controlled test error');
  }

  @Get('plain-error')
  throwPlainError(): never {
    throw new Error('private internal detail');
  }
}

describe('HTTP conventions (e2e)', () => {
  let app: NestFastifyApplication;
  let redisSet: jest.Mock<Promise<string>, [key: string, value: string, expiry: 'EX', ttl: number]>;

  beforeEach(async () => {
    redisSet = jest.fn<Promise<string>, [string, string, 'EX', number]>().mockResolvedValue('OK');
    const redisClient = {
      status: 'ready',
      options: { keyPrefix: '' },
      set: redisSet,
      quit: jest.fn(() => Promise.resolve('OK')),
      disconnect: jest.fn(),
    } as unknown as Redis;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [E2eController],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisClient)
      .compile();

    const config = moduleFixture.get<ConfigService<Env, true>>(ConfigService);
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        trustProxy: config.get('TRUST_PROXY'),
        bodyLimit: config.get('BODY_LIMIT_BYTES'),
        logger: getPinoOptions({
          NODE_ENV: config.get('NODE_ENV'),
          LOG_LEVEL: config.get('LOG_LEVEL'),
        }),
        genReqId: (incoming: IncomingMessage | Http2ServerRequest) =>
          getRequestId(incoming.headers),
      }),
    );
    app.useLogger(app.get(Logger));
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (incoming, reply, done) => {
        reply.header('x-request-id', incoming.id);
        done();
      });
    const healthRoute = [{ path: 'health', method: RequestMethod.GET }];
    app.setGlobalPrefix('api', { exclude: healthRoute });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.enableCors({ origin: config.get('CORS_ORIGINS') });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: true,
          data: { status: 'ok' },
          meta: { requestId: response.headers['x-request-id'] },
        });
      });
  });

  it('returns formatted Nest errors for an unknown versioned API route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NotFoundException' },
      meta: { path: '/api/v1/unknown', requestId: response.headers['x-request-id'] },
    });
  });

  it('allows configured CORS origins', () => {
    return request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://allowed.example')
      .expect(200)
      .expect('access-control-allow-origin', 'https://allowed.example');
  });

  it('omits the CORS header for other origins', () => {
    return request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://other.example')
      .expect(200)
      .expect((response) => {
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      });
  });

  it('returns the parsed request body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/test/body')
      .send({ count: '3' })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: true,
          data: { count: 3 },
          meta: { path: '/api/v1/test/body' },
        });
      });
  });

  it('stores a string OTP with a two-minute TTL and does not return it', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/enrollments/challenge')
      .send({ phoneNumber: '09123456789' })
      .expect(200);

    expect(response.body).toMatchObject({ success: true, data: null });
    expect(JSON.stringify(response.body)).not.toMatch(/\b\d{6}\b/);
    expect(redisSet).toHaveBeenCalledWith(
      'enrollments:challenge:09123456789',
      expect.stringMatching(/^\d{6}$/),
      'EX',
      120,
    );
  });

  it('rejects an invalid Iranian mobile number', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/enrollments/challenge')
      .send({ phoneNumber: '123456789' })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        details: [{ path: ['phoneNumber'] }],
      },
    });
  });

  it('returns structured validation errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test/body')
      .send({ count: 'invalid' })
      .expect(400);
    const responseBody: unknown = response.body;
    const body = z
      .object({
        success: z.literal(false),
        error: z.object({
          code: z.string(),
          details: z.array(
            z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }),
          ),
        }),
        meta: z.object({
          path: z.string(),
          timestamp: z.string(),
          requestId: z.string(),
        }),
      })
      .parse(responseBody);

    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0]?.path).toEqual(['count']);
    expect(body.error.details[0]?.message).toEqual(expect.any(String));
    expect(body.meta.path).toBe('/api/v1/test/body');
    expect(body.meta.requestId).toBe(response.headers['x-request-id']);
    expect(body.meta.timestamp).not.toBe('');
  });

  it('preserves an AppException code and includes the request id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/test/app-error').expect(409);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'TEST_FAILURE', message: 'Controlled test error' },
      meta: { requestId: response.headers['x-request-id'] },
    });
  });

  it('hides plain error details and includes the request id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/test/plain-error').expect(500);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      meta: { requestId: response.headers['x-request-id'] },
    });
    expect(JSON.stringify(response.body)).not.toContain('private internal detail');
  });

  it('returns a request id and echoes a valid incoming id', async () => {
    const generated = await request(app.getHttpServer()).get('/health').expect(200);
    expect(generated.headers['x-request-id']).toEqual(expect.any(String));

    const echoed = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'client-request_42.id')
      .expect(200);
    expect(echoed.headers['x-request-id']).toBe('client-request_42.id');
  });

  afterEach(async () => {
    await app.close();
  });
});
