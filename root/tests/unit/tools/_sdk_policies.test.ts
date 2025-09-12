import { withPolicies, amadeusLimiter } from '../../../src/tools/_sdk_policies.js';

describe('SDK Policies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute function successfully', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const result = await withPolicies(mockFn);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should respect AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    
    const mockFn = jest.fn().mockResolvedValue('success');
    
    await expect(withPolicies(mockFn, controller.signal))
      .rejects.toThrow('Aborted');
    
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('should retry on failure', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');
    
    const result = await withPolicies(mockFn, undefined, 10000);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should timeout after specified duration', async () => {
    const mockFn = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 2000))
    );
    
    await expect(withPolicies(mockFn, undefined, 100))
      .rejects.toThrow();
    
    expect(mockFn).toHaveBeenCalledTimes(1);
  }, 10000);

  it('should respect rate limiting', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const promises = Array.from({ length: 10 }, () => 
      withPolicies(mockFn, undefined, 5000)
    );
    
    const results = await Promise.all(promises);
    
    expect(results).toHaveLength(10);
    expect(results.every(r => r === 'success')).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(10);
  });
});
