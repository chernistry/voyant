/**
 * Vectara RAG configuration with environment-driven endpoints and corpus settings.
 * Supports configurable base URLs and paths for different Vectara deployments.
 */
export const VECTARA = {
  BASE_URL: process.env.VECTARA_BASE_URL || 'https://api.vectara.io',
  // Default to v2. Tests may override via jest.mock.
  QUERY_PATH: process.env.VECTARA_QUERY_PATH || '/v2/query',
  INDEX_PATH: process.env.VECTARA_INDEX_PATH || '/v1/index',
  API_KEY: process.env.VECTARA_API_KEY || '',
  CUSTOMER_ID: process.env.VECTARA_CUSTOMER_ID || '',
  CORPUS: {
    AIRLINES: process.env.VECTARA_CORPUS_AIRLINES || '',
    HOTELS: process.env.VECTARA_CORPUS_HOTELS || '',
    VISAS: process.env.VECTARA_CORPUS_VISAS || '',
  },
  TIMEOUT_MS: Number(process.env.VECTARA_TIMEOUT_MS || 3500),
  RETRIES: Number(process.env.VECTARA_RETRIES || 2),
  CACHE_TTL_MS: Number(process.env.VECTARA_CACHE_TTL_MS || 10_000),
  ENABLED: process.env.POLICY_RAG === 'on' || process.env.VECTARA_API_KEY !== '',
} as const;
