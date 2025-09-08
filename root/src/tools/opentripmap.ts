import { z } from 'zod';
import { fetchJSON, ExternalFetchError } from '../util/fetch.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import { CIRCUIT_BREAKER_CONFIG } from '../config/resilience.js';

const BASE_URL = 'https://api.opentripmap.com/0.1/en/places';

// Circuit breaker for OpenTripMap API
const openTripMapCircuitBreaker = new CircuitBreaker(CIRCUIT_BREAKER_CONFIG, 'opentripmap');

// Two possible formats from OpenTripMap:
// 1) format=json → features: [{ xid, name, kinds, point: { lat, lon } }]
// 2) format=geojson → features: [{ properties: { xid, name, kinds }, geometry: { coordinates: [lon, lat] } }]
const JsonFeatureSchema = z.object({
  xid: z.string(),
  name: z.string().optional().default(''),
  kinds: z.string().optional(),
  point: z.object({ lat: z.number(), lon: z.number() }),
});
const JsonResponseSchema = z.object({ features: z.array(JsonFeatureSchema) });

const GeoFeatureSchema = z.object({
  properties: z.object({
    xid: z.string(),
    name: z.string().optional().default(''),
    kinds: z.string().optional(),
  }),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number()]),
  }),
});
const GeoResponseSchema = z.object({ features: z.array(GeoFeatureSchema) });

export type PoiFeature = {
  xid: string;
  name: string;
  kinds?: string;
  point: { lat: number; lon: number };
};

type Out =
  | { ok: true; pois: PoiFeature[]; source?: string }
  | { ok: false; reason: string; source?: string };

export async function searchPOIs(input: {
  lat: number;
  lon: number;
  radiusMeters?: number;
  limit?: number;
  kinds?: string; // e.g., 'interesting_places,tourist_facilities'
}): Promise<Out> {
  // In test environment, allow a placeholder key so nock mocks work
  const key = process.env.NODE_ENV === 'test' ? (process.env.OPENTRIPMAP_API_KEY || 'test') : process.env.OPENTRIPMAP_API_KEY;
  if (!key) return { ok: false, reason: 'missing_api_key' };
  const radius = Math.max(100, Math.min(20000, input.radiusMeters ?? 4000));
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const kinds = input.kinds ?? 'interesting_places,cultural,historic,architecture,museums,fortifications,urban_environment,other_buildings_and_structures';
  const url =
    `${BASE_URL}/radius?lon=${encodeURIComponent(String(input.lon))}` +
    `&lat=${encodeURIComponent(String(input.lat))}` +
    `&radius=${radius}&format=geojson&limit=${limit}` +
    `&kinds=${encodeURIComponent(kinds)}&apikey=${encodeURIComponent(key)}`;
  try {
    const json = await openTripMapCircuitBreaker.execute(async () => {
      return await fetchJSON<unknown>(url, {
        timeoutMs: 5000,
        retries: 2,
        target: 'opentripmap',
        headers: { 'Accept': 'application/json' },
      });
    });
    // Try GeoJSON first, then JSON fallback
    const geo = GeoResponseSchema.safeParse(json);
    if (geo.success) {
      const pois: PoiFeature[] = geo.data.features.map((f) => ({
        xid: f.properties.xid,
        name: f.properties.name || '',
        kinds: f.properties.kinds,
        point: { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] },
      }));
      return { ok: true, pois, source: 'opentripmap' };
    }
    const j = JsonResponseSchema.safeParse(json);
    if (j.success) {
      const pois: PoiFeature[] = j.data.features.map((f) => ({
        xid: f.xid,
        name: f.name || '',
        kinds: f.kinds,
        point: { lat: f.point.lat, lon: f.point.lon },
      }));
      return { ok: true, pois, source: 'opentripmap' };
    }
    return { ok: false, reason: 'invalid_schema', source: 'opentripmap' };
  } catch (e) {
    // Handle circuit breaker errors
    if (e instanceof Error && e.name === 'CircuitBreakerError') {
      return { ok: false, reason: 'circuit_breaker_open', source: 'opentripmap' };
    }
    
    if (e instanceof ExternalFetchError) {
      if (e.kind === 'timeout') return { ok: false, reason: 'timeout', source: 'opentripmap' };
      if (e.kind === 'http') {
        return { ok: false, reason: e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx', source: 'opentripmap' };
      }
      return { ok: false, reason: 'network', source: 'opentripmap' };
    }
    return { ok: false, reason: 'network', source: 'opentripmap' };
  }
}

// Detail schema for a specific POI by xid
const PoiDetailSchema = z.object({
  xid: z.string(),
  name: z.string().optional().default(''),
  kinds: z.string().optional(),
  wikipedia_extracts: z
    .object({
      text: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
  url: z.string().optional(),
  wikipedia: z.string().optional(),
});

export type PoiDetail = {
  xid: string;
  name: string;
  description?: string;
  url?: string;
};

export async function getPOIDetail(xid: string): Promise<
  | { ok: true; detail: PoiDetail; source?: string }
  | { ok: false; reason: string; source?: string }
> {
  const key = process.env.NODE_ENV === 'test' ? (process.env.OPENTRIPMAP_API_KEY || 'test') : process.env.OPENTRIPMAP_API_KEY;
  if (!key) return { ok: false, reason: 'missing_api_key' };
  const url = `${BASE_URL}/xid/${encodeURIComponent(xid)}?apikey=${encodeURIComponent(key)}`;
  try {
    const json = await openTripMapCircuitBreaker.execute(async () => {
      return await fetchJSON<unknown>(url, {
        timeoutMs: 5000,
        retries: 1,
        target: 'opentripmap',
        headers: { Accept: 'application/json' },
      });
    });
    const parsed = PoiDetailSchema.safeParse(json);
    if (!parsed.success) return { ok: false, reason: 'invalid_schema', source: 'opentripmap' };
    const data = parsed.data;
    return {
      ok: true,
      detail: {
        xid: data.xid,
        name: data.name || '',
        description: data.wikipedia_extracts?.text,
        url: data.url || data.wikipedia,
      },
      source: 'opentripmap',
    };
  } catch (e) {
    // Handle circuit breaker errors
    if (e instanceof Error && e.name === 'CircuitBreakerError') {
      return { ok: false, reason: 'circuit_breaker_open', source: 'opentripmap' };
    }
    
    if (e instanceof ExternalFetchError) {
      if (e.kind === 'timeout') return { ok: false, reason: 'timeout', source: 'opentripmap' };
      if (e.kind === 'http') {
        return { ok: false, reason: e.status && e.status >= 500 ? 'http_5xx' : 'http_4xx', source: 'opentripmap' };
      }
      return { ok: false, reason: 'network', source: 'opentripmap' };
    }
    return { ok: false, reason: 'network', source: 'opentripmap' };
  }
}
