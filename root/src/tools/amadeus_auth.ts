import { ExternalFetchError } from '../util/fetch.js';
import { z } from 'zod';

const AmadeusTokenResponse = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Cached OAuth2 token for Amadeus (client-credentials).
 * Refreshes 1 minute before expiry.
 */
export async function getAmadeusToken(signal?: AbortSignal): Promise<string> {
  const now = Date.now();
  
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Amadeus credentials not configured');
  }

  const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';
  
  try {
    const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: signal || AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new ExternalFetchError('http', `HTTP ${response.status}`, response.status);
    }

    const data = await response.json();
    const parsed = AmadeusTokenResponse.parse(data);
    cachedToken = {
      token: parsed.access_token,
      expiresAt: now + (parsed.expires_in * 1000) - 60000,
    };

    return parsed.access_token;
  } catch (error) {
    if (error instanceof ExternalFetchError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExternalFetchError('timeout', 'Request timeout');
    }
    throw new ExternalFetchError('network', 'Network error');
  }
}
