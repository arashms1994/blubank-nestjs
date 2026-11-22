import { z } from 'zod';

const trustedProxy = z.union([
  z.enum(['loopback', 'linklocal', 'uniquelocal']),
  z.ipv4(),
  z.ipv6(),
  z.cidrv4(),
  z.cidrv6(),
]);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).positive().default(4000),
    REDIS_HOST: z.string().min(1).default('localhost'),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).default(0),
    REDIS_KEY_PREFIX: z.string().default(''),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1).max(1_048_576).default(1_048_576),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((origins) =>
        origins
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    TRUST_PROXY: z
      .union([z.literal('false').transform(() => false as const), trustedProxy])
      .default(false),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'At least one origin is required in production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'development' ? 'debug' : 'info'),
  }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(input: Record<string, unknown>): Env {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const variable = issue.path.length > 0 ? issue.path.join('.') : 'ENV';
      return `- ${variable}: ${issue.message}`;
    });

    throw new Error(`Invalid environment variables:\n${errors.join('\n')}`);
  }

  return result.data;
}
