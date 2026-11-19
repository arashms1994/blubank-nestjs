import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { RedisService } from '../common/redis/redis.service.js';

const OTP_TTL_SECONDS = 120;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly redisService: RedisService) {}

  async createChallenge(phoneNumber: string): Promise<void> {
    const otp = String(randomInt(100_000, 1_000_000));
    await this.redisService.setString(`enrollments:challenge:${phoneNumber}`, otp, OTP_TTL_SECONDS);
  }
}
