import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';

import { type ApiErrorResponse, createErrorResponse, createResponseMetadata } from './api-response';
import { AppException } from './app-exception';

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const metadata = createResponseMetadata(request);
    let response: ApiErrorResponse;
    let statusCode: number;
    if (exception instanceof ZodError) {
      statusCode = HttpStatus.BAD_REQUEST;
      response = createErrorResponse(
        {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: exception.issues.map(({ path, message }) => ({ path, message })),
        },
        metadata,
      );
    } else if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      response = createErrorResponse(
        {
          code: exception.code,
          message: exception.message,
          ...(exception.details === undefined ? {} : { details: exception.details }),
        },
        metadata,
      );
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      if (statusCode < 500) {
        response = createErrorResponse(
          {
            code: exception.name,
            message: getClientMessage(exception),
          },
          metadata,
        );
      } else {
        this.logger.error({ err: exception }, 'Unhandled server HTTP error');
        response = createErrorResponse(
          { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
          metadata,
        );
      }
    } else {
      this.logger.error({ err: exception }, 'Unhandled request error');
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      response = createErrorResponse(
        { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        metadata,
      );
    }

    void reply.status(statusCode).send(response);
  }
}

function getClientMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = response.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((item: unknown) => typeof item === 'string')) {
      return message.join(', ');
    }
  }
  return exception.message;
}
