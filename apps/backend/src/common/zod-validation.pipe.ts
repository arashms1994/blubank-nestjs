import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<Schema extends ZodType> implements PipeTransform<
  unknown,
  Promise<Schema['_output']>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): Promise<Schema['_output']> {
    return this.schema.parseAsync(value);
  }
}
