import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
    '^.+\\.(js|jsx|mjs|cjs)$': ['babel-jest', { presets: ['@babel/preset-env'] }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!tavily/)(?!ky/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^tavily$': '<rootDir>/tests/__mocks__/tavily.js'
  },
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 45000,
  forceExit: true,
  detectOpenHandles: true,
  testSequencer: '<rootDir>/tests/custom-sequencer.js',
  maxWorkers: 1,
};