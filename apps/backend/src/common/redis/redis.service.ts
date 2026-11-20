import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { InjectRedis } from './redis.constants.js';

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && (value as unknown[]).every((item: unknown) => typeof item === 'string')
  );
}

@Injectable()
export class RedisService {
  constructor(@InjectRedis() private readonly client: Redis) {}

  getClient(): Redis {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serializedValue = JSON.stringify(value);
    if (serializedValue === undefined) {
      throw new TypeError('Redis values must be JSON-serializable');
    }

    if (ttlSeconds === undefined) {
      await this.client.set(key, serializedValue);
      return;
    }

    await this.client.set(key, serializedValue, 'EX', ttlSeconds);
  }

  async setString(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async getString(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    return this.client.unlink(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  async setNx(key: string, value: string | number, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, String(value), 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  async delByPattern(pattern: string): Promise<number> {
    const keyPrefix = this.client.options.keyPrefix ?? '';
    const scanPattern =
      keyPrefix.length > 0 && !pattern.startsWith(keyPrefix) ? `${keyPrefix}${pattern}` : pattern;
    let deletedCount = 0;

    const scanStream: AsyncIterable<unknown> = this.client.scanStream({
      match: scanPattern,
      count: 100,
    });

    for await (const chunk of scanStream) {
      if (!isStringArray(chunk)) {
        throw new TypeError('Redis SCAN returned an invalid key batch');
      }

      const scannedKeys = chunk;
      const keys =
        keyPrefix.length > 0
          ? scannedKeys
              .filter((key) => key.startsWith(keyPrefix))
              .map((key) => key.slice(keyPrefix.length))
          : scannedKeys;

      if (keys.length === 0) {
        continue;
      }

      const result = await this.client.pipeline().unlink(keys).exec();
      if (result === null) {
        continue;
      }

      const commandResult = result[0];
      if (commandResult === undefined) {
        continue;
      }

      const [error, count] = commandResult;
      if (error !== null) {
        throw error;
      }
      if (typeof count === 'number') {
        deletedCount += count;
      }
    }

    return deletedCount;
  }
}
