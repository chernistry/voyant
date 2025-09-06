declare module 'opossum' {
  interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    rollingCountTimeout?: number;
    volumeThreshold?: number;
  }

  class CircuitBreaker<T> {
    constructor(fn: (...args: any[]) => Promise<T>, options?: CircuitBreakerOptions);
    fire(...args: any[]): Promise<T>;
    fallback(fn: (...args: any[]) => any): void;
    on(event: string, listener: (...args: any[]) => void): void;
  }

  export = CircuitBreaker;
}

declare module 'bottleneck' {
  interface BottleneckOptions {
    minTime?: number;
    maxConcurrent?: number;
  }

  class Bottleneck {
    constructor(options?: BottleneckOptions);
    schedule<T>(fn: () => Promise<T>): Promise<T>;
    queued(): number;
    running(): number;
  }

  export = Bottleneck;
}
