import { randomUUID } from 'node:crypto';

const safeRequestId = /^[A-Za-z0-9._-]{1,64}$/;

export function getRequestId(headers: Record<string, string | string[] | undefined>): string {
  const incoming = headers['x-request-id'];
  const requestId = Array.isArray(incoming) ? incoming[0] : incoming;

  return requestId !== undefined && safeRequestId.test(requestId) ? requestId : randomUUID();
}
