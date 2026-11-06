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

import { AppException } from './app-exception';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
  requestId: string;
}

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const requestId = request.id;

    let response: ErrorResponse;
    if (exception instanceof ZodError) {
      response = {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: exception.issues.map(({ path, message }) => ({ path, message })),
        path: request.url.split('?')[0] ?? request.url,
        timestamp: new Date().toISOString(),
        requestId,
      };
    } else if (exception instanceof AppException) {
      response = {
        statusCode: exception.getStatus(),
        error: exception.code,
        message: exception.message,
        ...(exception.details === undefined ? {} : { details: exception.details }),
        path: request.url.split('?')[0] ?? request.url,
        timestamp: new Date().toISOString(),
        requestId,
      };
    } else if (exception instanceof HttpException) {
      response = {
        statusCode: exception.getStatus(),
        error: exception.name,
        message: exception.message,
        path: request.url.split('?')[0] ?? request.url,
        timestamp: new Date().toISOString(),
        requestId,
      };
    } else {
      this.logger.error({ err: exception }, 'Unhandled request error');
      response = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        path: request.url.split('?')[0] ?? request.url,
        timestamp: new Date().toISOString(),
        requestId,
      };
    }

    void reply.status(response.statusCode).send(response);
  }
}
