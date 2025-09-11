import nock from 'nock';
import { searchPOIs } from '../../src/tools/opentripmap.js';

describe('OpenTripMap adapter', () => {
  const API = 'https://api.opentripmap.com';
  beforeAll(() => {
    process.env.OPENTRIPMAP_API_KEY = 'test_key';
  });
  afterAll(() => {
    delete process.env.OPENTRIPMAP_API_KEY;
  });

  test('returns parsed POIs on geojson', async () => {
    const scope = nock(API)
      .get(/\/0\.1\/en\/places\/radius.*/)
      .reply(200, {
        features: [
          {
            properties: { xid: 'X1', name: 'Museum A', kinds: 'museums' },
            geometry: { coordinates: [2.2945, 48.8584] },
          },
        ],
      });
    const res = await searchPOIs({ lat: 48.8584, lon: 2.2945, limit: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.pois[0]?.xid).toBe('X1');
      expect(res.pois[0]?.name).toBe('Museum A');
      expect(res.pois[0]?.point.lat).toBeCloseTo(48.8584);
      expect(res.pois[0]?.point.lon).toBeCloseTo(2.2945);
    }
    scope.done();
  });

  test('handles missing API key', async () => {
    delete process.env.OPENTRIPMAP_API_KEY;
    const res = await searchPOIs({ lat: 0, lon: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('missing_api_key');
  });
});


