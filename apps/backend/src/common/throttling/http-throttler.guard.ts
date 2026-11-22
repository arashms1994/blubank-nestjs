import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';

@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfter = Math.max(1, detail.timeToBlockExpire);
    context
      .switchToHttp()
      .getResponse<FastifyReply>()
      .header('Retry-After', retryAfter)
      .header(`${this.headerPrefix}-Limit`, detail.limit)
      .header(`${this.headerPrefix}-Remaining`, 0)
      .header(`${this.headerPrefix}-Reset`, retryAfter);

    return super.throwThrottlingException(context, detail);
  }
}
