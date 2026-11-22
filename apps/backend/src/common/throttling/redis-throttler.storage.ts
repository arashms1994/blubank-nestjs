import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { z } from 'zod';

const incrementScript = `
local hitsKey, blockKey = KEYS[1], KEYS[2]
local ttl, limit, blockDuration = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local blockRemaining = redis.call('PTTL', blockKey)

if blockRemaining >= 0 then
  return { tonumber(redis.call('GET', blockKey)), math.max(0, redis.call('PTTL', hitsKey)), 1, blockRemaining }
end

local totalHits = redis.call('INCR', hitsKey)
local remaining = redis.call('PTTL', hitsKey)
if remaining == -1 then
  redis.call('PEXPIRE', hitsKey, ttl)
  remaining = ttl
end

if totalHits > limit then
  redis.call('SET', blockKey, totalHits, 'PX', blockDuration)
  if remaining > blockDuration then
    redis.call('PEXPIRE', hitsKey, blockDuration)
    remaining = blockDuration
  end
  return { totalHits, remaining, 1, blockDuration }
end

return { totalHits, remaining, 0, 0 }
`;

const incrementResult = z.tuple([
  z.number(),
  z.number(),
  z.union([z.literal(0), z.literal(1)]),
  z.number(),
]);

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ReturnType<ThrottlerStorage['increment']> {
    // ioredis prepends the configured prefix to both keys; the hash tag keeps them in one Redis slot.
    const bucket = `throttle:{${throttlerName}:${key}}`;
    const result: unknown = await this.redis
      .eval(incrementScript, 2, `${bucket}:hits`, `${bucket}:block`, ttl, limit, blockDuration)
      .catch((cause: unknown) => {
        throw new Error('Redis throttling counter update failed', { cause });
      });
    const [totalHits, remaining, blocked, blockRemaining] = incrementResult.parse(result);

    return {
      totalHits,
      timeToExpire: Math.ceil(remaining / 1_000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil(blockRemaining / 1_000),
    };
  }
}
