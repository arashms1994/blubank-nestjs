import type { Env } from './env.schema';

export function getPinoOptions(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>) {
  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  };
}
