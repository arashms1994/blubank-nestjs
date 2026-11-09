import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EnrollmentsService } from './enrollments.service';

const otpRequestSchema = z.object({
  phoneNumber: z.string().regex(/^09\d{9}$/, 'Must be a valid Iranian mobile number'),
});

type OtpRequest = z.infer<typeof otpRequestSchema>;

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('otp')
  generateOtp(@Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest) {
    return this.enrollmentsService.generateOtp(body.phoneNumber);
  }
}
