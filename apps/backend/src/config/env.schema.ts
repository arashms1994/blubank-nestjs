import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
});

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
