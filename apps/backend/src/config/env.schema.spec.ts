import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('parses defaults for an empty environment', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      HOST: '0.0.0.0',
      PORT: 4000,
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_DB: 0,
      REDIS_KEY_PREFIX: '',
      BODY_LIMIT_BYTES: 1_048_576,
      CORS_ORIGINS: [],
      TRUST_PROXY: false,
    });
  });

  it('coerces a valid port to a number', () => {
    expect(validateEnv({ PORT: '4100' }).PORT).toBe(4100);
  });

  it('defaults production logging to info and accepts a configured level', () => {
    expect(
      validateEnv({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example' }).LOG_LEVEL,
    ).toBe('info');
    expect(validateEnv({ LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe('warn');
  });

  it('accepts a smaller body limit and rejects values above 1 MB', () => {
    expect(validateEnv({ BODY_LIMIT_BYTES: '65536' }).BODY_LIMIT_BYTES).toBe(65_536);
    expect(() => validateEnv({ BODY_LIMIT_BYTES: '1048577' })).toThrow(/BODY_LIMIT_BYTES/);
  });

  it('parses comma-separated CORS origins and a trusted proxy CIDR', () => {
    expect(
      validateEnv({
        CORS_ORIGINS: 'https://app.example, https://admin.example',
        TRUST_PROXY: '10.0.0.0/24',
      }),
    ).toMatchObject({
      CORS_ORIGINS: ['https://app.example', 'https://admin.example'],
      TRUST_PROXY: '10.0.0.0/24',
    });
  });

  it.each(['loopback', '127.0.0.1', '2001:db8::/64'])('accepts %s for proxy trust', (proxy) => {
    expect(validateEnv({ TRUST_PROXY: proxy }).TRUST_PROXY).toBe(proxy);
  });

  it.each(['true', '1', 'example.com', '10.0.0.0/33'])('rejects %s for proxy trust', (proxy) => {
    expect(() => validateEnv({ TRUST_PROXY: proxy })).toThrow(/TRUST_PROXY/);
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
