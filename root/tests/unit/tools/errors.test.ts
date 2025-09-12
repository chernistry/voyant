import { toStdError } from '../../../src/tools/errors.js';

describe('Error Handling', () => {
  it('should map 401 error correctly', () => {
    const error = {
      response: {
        status: 401,
        headers: {},
      },
    };
    
    const result = toStdError(error, 'test_context');
    
    expect(result).toEqual({
      code: 'auth_error',
      message: 'Authentication failed',
      details: { status: 401 },
      causeId: 'test_context',
    });
  });

  it('should map 404 error correctly', () => {
    const error = {
      response: {
        status: 404,
        headers: {},
      },
    };
    
    const result = toStdError(error);
    
    expect(result).toEqual({
      code: 'not_found',
      message: 'Resource not found',
      details: { status: 404 },
      causeId: undefined,
    });
  });

  it('should map 429 error with retry-after', () => {
    const error = {
      response: {
        status: 429,
        headers: {
          'retry-after': '60',
        },
      },
    };
    
    const result = toStdError(error, 'rate_limit_test');
    
    expect(result).toEqual({
      code: 'rate_limit',
      message: 'Rate limit exceeded',
      details: { status: 429, retryAfter: '60' },
      causeId: 'rate_limit_test',
    });
  });

  it('should map 500 error correctly', () => {
    const error = {
      response: {
        status: 500,
        headers: {},
      },
    };
    
    const result = toStdError(error);
    
    expect(result).toEqual({
      code: 'server_error',
      message: 'Server error',
      details: { status: 500 },
      causeId: undefined,
    });
  });

  it('should map AbortError correctly', () => {
    const error = new Error('Request timeout');
    error.name = 'AbortError';
    
    const result = toStdError(error, 'timeout_test');
    
    expect(result).toEqual({
      code: 'timeout',
      message: 'Request timeout',
      causeId: 'timeout_test',
    });
  });

  it('should map generic Error correctly', () => {
    const error = new Error('Network connection failed');
    
    const result = toStdError(error, 'network_test');
    
    expect(result).toEqual({
      code: 'network_error',
      message: 'Network connection failed',
      causeId: 'network_test',
    });
  });

  it('should handle unknown error types', () => {
    const error = { unknown: 'error type' };
    
    const result = toStdError(error, 'unknown_test');
    
    expect(result).toEqual({
      code: 'unknown_error',
      message: 'Unknown error occurred',
      details: error,
      causeId: 'unknown_test',
    });
  });
});
