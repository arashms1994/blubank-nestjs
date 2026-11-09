import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

@Injectable()
export class EnrollmentsService {
  generateOtp(phoneNumber: string): { phoneNumber: string; otp: number } {
    return {
      phoneNumber,
      otp: randomInt(100_000, 1_000_000),
    };
  }
}
