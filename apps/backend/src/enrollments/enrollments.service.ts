import { randomInt } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../common/app-exception.js';
import { RedisService } from '../common/redis/redis.service.js';

const OTP_TTL_SECONDS = 120;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly redisService: RedisService) {}

  async createChallenge(phoneNumber: string): Promise<void> {
    const otp = String(randomInt(100_000, 1_000_000));
    const key = `enrollments:challenge:${phoneNumber}`;
    const created = await this.redisService.setNx(key, otp, OTP_TTL_SECONDS);

    if (!created) {
      throw new AppException(
        'OTP_ALREADY_SENT',
        HttpStatus.TOO_MANY_REQUESTS,
        'کد تأیید قبلاً ارسال شده است. لطفاً کمی بعد دوباره تلاش کنید',
      );
    }

    // TODO: Send the challenge code by SMS.
  }

  async verify(phoneNumber: string, otp: string): Promise<void> {
    const key = `enrollments:challenge:${phoneNumber}`;
    const challenge = await this.redisService.getString(key);

    if (challenge === null || challenge !== otp) {
      throw new AppException(
        'INVALID_OR_EXPIRED_OTP',
        HttpStatus.BAD_REQUEST,
        'کد وارد شده صحیح نیست یا منقضی شده است',
      );
    }

    await this.redisService.del(key);
  }
}
