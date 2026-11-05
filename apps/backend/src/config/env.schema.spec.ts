import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('parses defaults for an empty environment', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 4000,
    });
  });

  it('coerces a valid port to a number', () => {
    expect(validateEnv({ PORT: '4100' }).PORT).toBe(4100);
  });

  it('reports every invalid variable in a readable list', () => {
    expect(() => validateEnv({ NODE_ENV: 'test', PORT: 'invalid' })).toThrow(
      /Invalid environment variables:\n- NODE_ENV:.*\n- PORT:/,
    );
  });
});
