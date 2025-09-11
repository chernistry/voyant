import { fetchJSON, ExternalFetchError } from '../../src/util/fetch.js';

describe('Fetch allowlist', () => {
  test('blocks non-allowlisted host', async () => {
    await expect(
      fetchJSON('https://example.com/data.json')
    ).rejects.toBeInstanceOf(ExternalFetchError);
  });

  test('allows known host (does not assert network, only URL check)', async () => {
    // We only check that URL parsing does not throw host_not_allowed upfront.
    // The network call may still fail; we accept either ok or classified error.
    try {
      await fetchJSON('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0');
    } catch (e: any) {
      if (e instanceof ExternalFetchError) {
        expect(['timeout', 'http', 'network']).toContain(e.kind);
      }
    }
  });
});


