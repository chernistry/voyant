import Bottleneck from 'bottleneck';
import { 
  retry, 
  handleAll, 
  timeout, 
  ExponentialBackoff, 
  TimeoutStrategy,
  wrap
} from 'cockatiel';

export const amadeusLimiter = new Bottleneck({
  minTime: Number(process.env.AMADEUS_MIN_MS ?? 100),
  maxConcurrent: Number(process.env.AMADEUS_MAX_CONC ?? 5),
});

const backoff = new ExponentialBackoff({ 
  initialDelay: 200, 
  maxDelay: 1500 
});

export const amadeusPolicy = retry(handleAll, { 
  maxAttempts: 3, 
  backoff 
});

/**
 * Wraps function with rate limiting, retries, and timeout policies.
 */
export async function withPolicies<T>(
  fn: () => Promise<T>, 
  signal?: AbortSignal, 
  timeoutMs = 5000
): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const run = async () => {
    try {
      return await fn();
    } catch (error) {
      console.error('SDK call failed:', error);
      throw error;
    }
  };
  
  const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  const pol = wrap(timeoutPolicy, amadeusPolicy);
  
  return amadeusLimiter.schedule(() => pol.execute(run));
}
