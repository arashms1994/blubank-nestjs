import { RequestMethod, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import type { Env } from './../src/config/env.schema';

describe('HTTP conventions (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const config = moduleFixture.get<ConfigService<Env, true>>(ConfigService);
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        trustProxy: config.get('TRUST_PROXY'),
        bodyLimit: config.get('BODY_LIMIT_BYTES'),
      }),
    );
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

  it('returns 404 for an unknown versioned API route', () => {
    return request(app.getHttpServer()).get('/api/v1/unknown').expect(404);
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

  afterEach(async () => {
    await app.close();
  });
});
