import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  createChallenge(@Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest): Promise<void> {
    return this.enrollmentsService.createChallenge(body.phoneNumber);
  }
}
