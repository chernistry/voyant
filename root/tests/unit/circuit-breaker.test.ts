import { CircuitBreaker, CircuitBreakerState, CircuitBreakerError } from '../../src/core/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  
  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeout: 2000,
      monitoringPeriod: 5000
    }, 'test');
  });

  describe('CLOSED state', () => {
    it('should execute function successfully', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open after failure threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Force circuit to open
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected
        }
      }
    });

    it('should reject requests immediately', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(CircuitBreakerError);
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      await circuitBreaker.execute(mockFn);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Force circuit to open
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected
        }
      }
      
      // Wait for reset timeout to transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 2100));
    });

    it('should close after success threshold', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Execute successfully twice to reach success threshold
      await circuitBreaker.execute(mockFn);
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open immediately on failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      try {
        await circuitBreaker.execute(mockFn);
      } catch (error) {
        // Expected
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running functions', async () => {
      const mockFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Circuit breaker timeout');
    });
  });

  describe('metrics', () => {
    it('should track failure count', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      try {
        await circuitBreaker.execute(mockFn);
      } catch (error) {
        // Expected
      }
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
      expect(metrics.lastFailureTime).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Force some failures
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected
        }
      }
      
      circuitBreaker.reset();
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
    });
  });
});
