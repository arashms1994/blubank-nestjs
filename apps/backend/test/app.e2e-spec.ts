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
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { z } from 'zod';

import { AppModule } from './../src/app.module';
import { AppException } from './../src/common/app-exception';
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

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [E2eController],
    }).compile();

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
    return request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('returns formatted Nest errors for an unknown versioned API route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'NotFoundException',
      path: '/api/v1/unknown',
      requestId: response.headers['x-request-id'],
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
      .expect({ count: 3 });
  });

  it('generates an OTP for an Iranian mobile number', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/enrollments/otp')
      .send({ phoneNumber: '09123456789' })
      .expect(201);
    const body = z
      .object({ phoneNumber: z.string(), otp: z.number().int().min(100_000).max(999_999) })
      .parse(response.body as unknown);

    expect(body.phoneNumber).toBe('09123456789');
  });

  it('rejects an invalid Iranian mobile number', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/enrollments/otp')
      .send({ phoneNumber: '123456789' })
      .expect(400);

    expect(response.body).toMatchObject({
      error: 'VALIDATION_FAILED',
      details: [{ path: ['phoneNumber'] }],
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
        statusCode: z.number(),
        error: z.string(),
        details: z.array(
          z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }),
        ),
        path: z.string(),
        timestamp: z.string(),
        requestId: z.string(),
      })
      .parse(responseBody);

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.details[0]?.path).toEqual(['count']);
    expect(body.details[0]?.message).toEqual(expect.any(String));
    expect(body.path).toBe('/api/v1/test/body');
    expect(body.requestId).toBe(response.headers['x-request-id']);
    expect(body.timestamp).not.toBe('');
  });

  it('preserves an AppException code and includes the request id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/test/app-error').expect(409);

    expect(response.body).toMatchObject({
      statusCode: 409,
      error: 'TEST_FAILURE',
      message: 'Controlled test error',
      requestId: response.headers['x-request-id'],
    });
  });

  it('hides plain error details and includes the request id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/test/plain-error').expect(500);

    expect(response.body).toMatchObject({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: response.headers['x-request-id'],
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
