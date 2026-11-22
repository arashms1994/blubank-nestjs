import { randomInt } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../common/app-exception.js';
import { RedisService } from '../common/redis/redis.service.js';

const OTP_TTL_MS = 120_000;
const CHALLENGE_WINDOW_MS = 3_600_000;
const CHALLENGE_LIMIT = 5;

const createChallengeScript = `
local challengeKey, quotaKey = KEYS[1], KEYS[2]
local otp, cooldown, window, limit = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local cutoff = now - window

if redis.call('ZCOUNT', quotaKey, '(' .. cutoff, '+inf') >= limit then
  return 'limited'
end

if not redis.call('SET', challengeKey, otp, 'PX', cooldown, 'NX') then
  return 'active'
end

redis.call('ZREMRANGEBYSCORE', quotaKey, '-inf', cutoff)
-- A successful SET NX with the cooldown makes the millisecond timestamp unique per phone.
redis.call('ZADD', quotaKey, now, now)
redis.call('PEXPIRE', quotaKey, window)
return 'created'
`;

const verifyChallengeScript = `
local challengeKey = KEYS[1]
if redis.call('GET', challengeKey) ~= ARGV[1] then
  return 0
end

redis.call('SET', challengeKey, 'used', 'KEEPTTL')
return 1
`;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly redisService: RedisService) {}

  async createChallenge(phoneNumber: string): Promise<void> {
    const otp = String(randomInt(100_000, 1_000_000));
    const result: unknown = await this.redisService
      .getClient()
      .eval(
        createChallengeScript,
        2,
        `enrollments:challenge:${phoneNumber}`,
        `enrollments:challenge-quota:${phoneNumber}`,
        otp,
        OTP_TTL_MS,
        CHALLENGE_WINDOW_MS,
        CHALLENGE_LIMIT,
      );

    if (result === 'limited') {
      throw new AppException(
        'OTP_CHALLENGE_LIMIT_REACHED',
        HttpStatus.TOO_MANY_REQUESTS,
        'تعداد درخواست‌های کد تأیید برای این شماره به سقف مجاز رسیده است. لطفاً بعداً دوباره تلاش کنید',
      );
    }

    if (result === 'active') {
      throw new AppException(
        'OTP_ALREADY_SENT',
        HttpStatus.TOO_MANY_REQUESTS,
        'کد تأیید قبلاً ارسال شده است. لطفاً کمی بعد دوباره تلاش کنید',
      );
    }

    if (result !== 'created') {
      throw new TypeError('Unexpected Redis result while creating an enrollment challenge');
    }
  }

  async verify(phoneNumber: string, otp: string): Promise<void> {
    const result: unknown = await this.redisService
      .getClient()
      .eval(verifyChallengeScript, 1, `enrollments:challenge:${phoneNumber}`, otp);

    if (result === 0) {
      throw new AppException(
        'INVALID_OR_EXPIRED_OTP',
        HttpStatus.BAD_REQUEST,
        'کد وارد شده صحیح نیست یا منقضی شده است',
      );
    }

    if (result !== 1) {
      throw new TypeError('Unexpected Redis result while verifying an enrollment challenge');
    }
  }
}
