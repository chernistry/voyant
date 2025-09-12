export interface StandardError {
  code: string;
  message: string;
  details?: unknown;
  causeId?: string;
}

/**
 * Maps Amadeus SDK ResponseError to standard error shape.
 */
export function toStdError(error: unknown, ctx?: string): StandardError {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as any).response;
    const status = resp?.status || 500;
    
    if (status === 401 || status === 403) {
      return {
        code: 'auth_error',
        message: 'Authentication failed',
        details: { status },
        causeId: ctx,
      };
    }
    
    if (status === 404) {
      return {
        code: 'not_found',
        message: 'Resource not found',
        details: { status },
        causeId: ctx,
      };
    }
    
    if (status === 429) {
      return {
        code: 'rate_limit',
        message: 'Rate limit exceeded',
        details: { status, retryAfter: resp?.headers?.['retry-after'] },
        causeId: ctx,
      };
    }
    
    if (status >= 500) {
      return {
        code: 'server_error',
        message: 'Server error',
        details: { status },
        causeId: ctx,
      };
    }
  }
  
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return {
        code: 'timeout',
        message: 'Request timeout',
        causeId: ctx,
      };
    }
    
    return {
      code: 'network_error',
      message: error.message,
      causeId: ctx,
    };
  }
  
  return {
    code: 'unknown_error',
    message: 'Unknown error occurred',
    details: error,
    causeId: ctx,
  };
}
