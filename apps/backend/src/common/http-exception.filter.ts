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
    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      response = createErrorResponse(
        {
          code: 'REQUEST_FAILED',
          message: exception.message,
        },
        metadata,
      );
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      if (statusCode < 500) {
        response = createErrorResponse(
          {
            code: 'REQUEST_FAILED',
            message: 'درخواست قابل انجام نیست',
          },
          metadata,
        );
      } else {
        this.logger.error({ err: exception }, 'Unhandled server HTTP error');
        response = createErrorResponse(
          { code: 'INTERNAL_ERROR', message: 'خطای داخلی رخ داد' },
          metadata,
        );
      }
    } else {
      this.logger.error({ err: exception }, 'Unhandled request error');
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      response = createErrorResponse(
        { code: 'INTERNAL_ERROR', message: 'خطای داخلی رخ داد' },
        metadata,
      );
    }

    void reply.status(statusCode).send(response);
  }
}
