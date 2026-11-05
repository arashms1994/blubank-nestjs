import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('parses defaults for an empty environment', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 4000,
      BODY_LIMIT_BYTES: 1_048_576,
      CORS_ORIGINS: [],
      TRUST_PROXY: false,
    });
  });

  it('coerces a valid port to a number', () => {
    expect(validateEnv({ PORT: '4100' }).PORT).toBe(4100);
  });

  it('accepts a smaller body limit and rejects values above 1 MB', () => {
    expect(validateEnv({ BODY_LIMIT_BYTES: '65536' }).BODY_LIMIT_BYTES).toBe(65_536);
    expect(() => validateEnv({ BODY_LIMIT_BYTES: '1048577' })).toThrow(/BODY_LIMIT_BYTES/);
  });

  it('parses comma-separated CORS origins and boolean proxy trust', () => {
    expect(
      validateEnv({
        CORS_ORIGINS: 'https://app.example, https://admin.example',
        TRUST_PROXY: 'true',
      }),
    ).toMatchObject({
      CORS_ORIGINS: ['https://app.example', 'https://admin.example'],
      TRUST_PROXY: true,
    });
  });

  it('requires at least one CORS origin in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
  });

  it('reports every invalid variable in a readable list', () => {
    expect(() => validateEnv({ NODE_ENV: 'test', PORT: 'invalid' })).toThrow(
      /Invalid environment variables:\n- NODE_ENV:.*\n- PORT:/,
    );
  });
});
