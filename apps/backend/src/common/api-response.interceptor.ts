import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { map, type Observable } from 'rxjs';

import { createResponseMetadata, createSuccessResponse } from './api-response';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const metadata = createResponseMetadata(request);

    return next
      .handle()
      .pipe(
        map((data: unknown) => createSuccessResponse(data === undefined ? null : data, metadata)),
      );
  }
}
