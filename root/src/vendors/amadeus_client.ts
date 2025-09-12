// @ts-ignore - Amadeus SDK doesn't have types
import Amadeus from 'amadeus';

export type AmadeusHost = 'test' | 'production';

let _client: Amadeus | undefined;

/**
 * Lazily creates and returns configured Amadeus SDK client.
 * Uses environment variables for configuration.
 */
export async function getAmadeusClient(): Promise<Amadeus> {
  if (_client) return _client;

  const hostname = (process.env.AMADEUS_HOSTNAME as AmadeusHost) ?? 'test';
  
  if (!process.env.AMADEUS_CLIENT_ID || !process.env.AMADEUS_CLIENT_SECRET) {
    throw new Error('AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET required');
  }

  console.log(`Initializing Amadeus client for ${hostname} environment`);

  _client = new Amadeus({
    clientId: process.env.AMADEUS_CLIENT_ID,
    clientSecret: process.env.AMADEUS_CLIENT_SECRET,
    hostname,
    logger: console,
    logLevel: process.env.AMADEUS_LOG_LEVEL ?? 'warn',
    customAppId: 'navan',
    customAppVersion: process.env.APP_VERSION ?? 'dev',
  });

  return _client;
}
