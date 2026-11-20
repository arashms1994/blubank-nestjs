import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
    message: string,
  ) {
    super(message, status);
  }
}
