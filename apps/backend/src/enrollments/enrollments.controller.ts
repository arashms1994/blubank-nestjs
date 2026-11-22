import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EnrollmentsService } from './enrollments.service';

const INVALID_ENROLLMENT_INPUT_MESSAGE = 'شماره همراه یا کد تأیید صحیح نمی‌باشد';

const otpRequestSchema = z.object({
  phoneNumber: z.string().regex(/^09\d{9}$/, INVALID_ENROLLMENT_INPUT_MESSAGE),
});

const otpVerificationSchema = otpRequestSchema.extend({
  otp: z.string().regex(/^\d{6}$/, INVALID_ENROLLMENT_INPUT_MESSAGE),
});

type OtpRequest = z.infer<typeof otpRequestSchema>;
type OtpVerification = z.infer<typeof otpVerificationSchema>;

@ApiTags('enrollments')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create an enrollment challenge' })
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Iranian mobile number in 09xxxxxxxxx format.',
          pattern: '^09\\d{9}$',
        },
      },
      required: ['phoneNumber'],
    },
  })
  @ApiOkResponse({ description: 'The OTP was saved and expires after two minutes.' })
  @ApiBadRequestResponse({
    description: 'The phone number is not a valid Iranian mobile number.',
  })
  createChallenge(
    @Body(new ZodValidationPipe(otpRequestSchema, INVALID_ENROLLMENT_INPUT_MESSAGE))
    body: OtpRequest,
  ): Promise<void> {
    return this.enrollmentsService.createChallenge(body.phoneNumber);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an enrollment OTP' })
  @Throttle({ default: { limit: 5, ttl: minutes(2) } })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Iranian mobile number in 09xxxxxxxxx format.',
          pattern: '^09\\d{9}$',
        },
        otp: { type: 'string', description: 'Six-digit OTP.', pattern: '^\\d{6}$' },
      },
      required: ['phoneNumber', 'otp'],
    },
  })
  @ApiOkResponse({ description: 'The OTP was verified.' })
  @ApiBadRequestResponse({ description: 'The OTP is invalid or expired.' })
  verify(
    @Body(new ZodValidationPipe(otpVerificationSchema, INVALID_ENROLLMENT_INPUT_MESSAGE))
    body: OtpVerification,
  ): Promise<void> {
    return this.enrollmentsService.verify(body.phoneNumber, body.otp);
  }
}
