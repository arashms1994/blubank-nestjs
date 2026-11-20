import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { AppException } from './app-exception';

export async function parseInput<Schema extends ZodType>(
  schema: Schema,
  value: unknown,
  validationMessage = 'اطلاعات ارسال‌شده معتبر نیست',
): Promise<Schema['_output']> {
  const result = await schema.safeParseAsync(value);
  if (result.success) {
    return result.data;
  }

  throw new AppException(
    'VALIDATION_FAILED',
    HttpStatus.BAD_REQUEST,
    validationMessage,
  );
}

@Injectable()
export class ZodValidationPipe<Schema extends ZodType> implements PipeTransform<
  unknown,
  Promise<Schema['_output']>
> {
  constructor(
    private readonly schema: Schema,
    private readonly validationMessage = 'اطلاعات ارسال‌شده معتبر نیست',
  ) {}

  transform(value: unknown): Promise<Schema['_output']> {
    return parseInput(this.schema, value, this.validationMessage);
  }
}
