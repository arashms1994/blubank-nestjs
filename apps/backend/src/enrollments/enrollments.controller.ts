import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EnrollmentsService } from './enrollments.service';

const otpRequestSchema = z.object({
  phoneNumber: z.string().regex(/^09\d{9}$/, 'Must be a valid Iranian mobile number'),
});

type OtpRequest = z.infer<typeof otpRequestSchema>;

@ApiTags('enrollments')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create an enrollment challenge' })
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
  createChallenge(@Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest): Promise<void> {
    return this.enrollmentsService.createChallenge(body.phoneNumber);
  }
}
