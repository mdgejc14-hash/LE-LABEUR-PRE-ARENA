export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'BUSINESS_RULE_VIOLATION'
  | 'RATE_LIMITED'
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
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/**
 * Redacts connection strings, session cookies, bearer tokens, passwords, and
 * internal R2 object keys so no client-exposed error can ever leak a secret.
 */
export function redactClientErrorText(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[secret-redacted]')
    .replace(/(__Host-lelabeur_session=)[^\s;"']+/gi, '$1[redacted]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
    .replace(/\b(password|secret|token_hash|signing_secret)\s*=\s*[^\s&;"']+/gi, '$1=[redacted]')
    .replace(/\bdocs\/[A-Za-z0-9_./-]+/g, '[internal-key-redacted]');
}

function redactErrorDetails(
  details: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  if (!details) return undefined;
  const sanitized: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(details)) {
    if (/object_?key|token_?hash|secret|password/i.test(key)) continue;
    sanitized[key] = Array.isArray(values)
      ? values.map(value => redactClientErrorText(String(value)))
      : [];
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

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
  const sanitizedDetails = exposeMessage ? redactErrorDetails(apiError.details) : undefined;
  const body: ApiErrorBody = {
    error: {
      code: apiError.code,
      message: exposeMessage ? redactClientErrorText(apiError.message) : 'Une erreur interne est survenue.',
      requestId,
      ...(sanitizedDetails ? { details: sanitizedDetails } : {}),
    },
  };

  const retryAfter = sanitizedDetails?.retryAfterSeconds?.[0];
  return new Response(JSON.stringify(body), {
    status: apiError.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
      ...(apiError.status === 429 && retryAfter ? { 'retry-after': retryAfter } : {}),
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
