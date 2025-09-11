const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 45000,
  forceExit: true,
  detectOpenHandles: true,
  testSequencer: '<rootDir>/tests/custom-sequencer.cjs',
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'ES2022',
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        noEmit: true,
        skipLibCheck: true,
        types: ['jest', 'node']
      }
    }
  }
};
