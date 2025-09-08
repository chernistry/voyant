import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { 
      useESM: false,  // Use CommonJS to avoid Jest ESM realm issues
      tsconfig: {
        module: 'commonjs'
      }
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 45000,
  forceExit: true,
  detectOpenHandles: true,
  testSequencer: '<rootDir>/tests/custom-sequencer.js',
  resetModules: true,
  // Run tests in single process to minimize realm issues
  maxWorkers: 1,
};
