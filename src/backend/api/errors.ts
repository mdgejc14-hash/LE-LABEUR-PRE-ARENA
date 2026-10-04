export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'BUSINESS_RULE_VIOLATION'
  | 'NOT_IMPLEMENTED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, string[]>;
  };
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  BUSINESS_RULE_VIOLATION: 422,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
    status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

export function apiErrorResponse(error: unknown, requestId: string): Response {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError('INTERNAL_ERROR', 'Une erreur interne est survenue.');

  const exposeMessage = apiError.status < 500;
  const body: ApiErrorBody = {
    error: {
      code: apiError.code,
      message: exposeMessage ? apiError.message : 'Une erreur interne est survenue.',
      requestId,
      ...(exposeMessage && apiError.details ? { details: apiError.details } : {}),
    },
  };

  return new Response(JSON.stringify(body), {
    status: apiError.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}

export function apiJsonResponse(body: unknown, status = 200, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  });
}
