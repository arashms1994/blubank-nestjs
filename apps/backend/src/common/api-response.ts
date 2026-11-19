import type { FastifyRequest } from 'fastify';

export interface ApiResponseMetadata {
  path: string;
  timestamp: string;
  requestId: string;
}

export interface ApiSuccessResponse<Data> {
  success: true;
  data: Data;
  meta: ApiResponseMetadata;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiResponseMetadata;
}

export type ApiResponse<Data> = ApiSuccessResponse<Data> | ApiErrorResponse;

export function createResponseMetadata(request: FastifyRequest): ApiResponseMetadata {
  return {
    path: request.url.split('?')[0] ?? request.url,
    timestamp: new Date().toISOString(),
    requestId: request.id,
  };
}

export function createSuccessResponse<Data>(
  data: Data,
  meta: ApiResponseMetadata,
): ApiSuccessResponse<Data> {
  return { success: true, data, meta };
}

export function createErrorResponse(
  error: ApiErrorResponse['error'],
  meta: ApiResponseMetadata,
): ApiErrorResponse {
  return { success: false, error, meta };
}
