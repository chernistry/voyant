import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

jest.mock('tavily', () => ({
  TavilyClient: jest.fn(() => ({
    search: jest.fn().mockResolvedValue({
      results: [
        {
          url: 'https://example.com',
          content: 'Mocked search result for tavily.',
          title: 'Mock Title',
        },
      ],
    }),
  })),
}));

jest.mock('tavily', () => ({
  TavilyClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      results: [
        {
          url: 'https://example.com',
          content: 'Mocked search result for tavily.',
          title: 'Mock Title',
        },
      ],
    }),
  })),
}));

jest.mock('tavily', () => ({
  TavilyClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      results: [
        {
          url: 'https://example.com',
          content: 'Mocked search result for tavily.',
          title: 'Mock Title',
        },
      ],
    }),
  })),
}));

jest.mock('tavily', () => ({
  TavilyClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      results: [
        {
          url: 'https://example.com',
          content: 'Mocked search result for tavily.',
          title: 'Mock Title',
        },
      ],
    }),
  })),
}));
import { configureNock, createTestApp, createRecorderIfEnabled, makeRequest, recordedRequest, TranscriptRecorder, nock } from './_setup.js';
import { expectLLMEvaluation } from '../../src/test/llm-evaluator.js';
import express from 'express';

configureNock();
process.env.NODE_ENV = 'test';

describe('E2E: Attractions & Variants', () => {
  let app: express.Express;
  let transcriptRecorder: TranscriptRecorder | undefined;

  beforeAll(() => {
    transcriptRecorder = createRecorderIfEnabled();
    if (transcriptRecorder) console.log('📝 Transcript saving enabled');
    else console.log('📝 Transcript saving disabled (use --save-transcripts to enable)');
  });

  afterAll(async () => {
    if (transcriptRecorder) {
      await transcriptRecorder.saveTranscripts();
      console.log('💾 Transcripts saved to deliverables/transcripts/');
    }
  });

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('🏛️ Attractions & Activities', () => {
    test('attractions queries with OpenTripMap API', async () => {
      // Allow real calls; or provide mocks if needed
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_tokyo_opentripmap', 'What attractions are there in Tokyo?');
      await expectLLMEvaluation(
        'Attractions query for Tokyo using real OpenTripMap API',
        r.body.reply,
        'Response should provide real POI information from OpenTripMap API with actual attraction names and cite OpenTripMap as the source. Descriptions are preferred but not required if OpenTripMap data lacks them.'
      ).toPass();
      expect(r.body.citations).toBeDefined();
      expect(Array.isArray(r.body.citations)).toBe(true);
    }, 45000);

    test('attractions in different cities with OpenTripMap', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_paris_opentripmap', 'What to do in Paris?');
      await expectLLMEvaluation(
        'Attractions query for Paris using real OpenTripMap API',
        r.body.reply,
        'Response should provide real Paris attractions from OpenTripMap API, not generic or LLM-generated content, with proper source citation'
      ).toPass();
      expect(r.body.reply).toBeDefined();
      expect(typeof r.body.reply).toBe('string');
      expect(r.body.reply.length).toBeGreaterThan(10);
    }, 45000);

    test('attractions in major tourist destinations', async () => {
      const r = await recordedRequest(app, transcriptRecorder, 'attractions_rome_opentripmap', 'What attractions are in Rome?');
      await expectLLMEvaluation(
        'Attractions query for Rome using travel APIs',
        r.body.reply,
        'Response should provide authentic Rome attractions from travel APIs (OpenTripMap or Brave Search), focusing on historical sites, landmarks, and tourist destinations'
      ).toPass();
      expect(r.body.citations).toBeDefined();
    }, 45000);
  });

  describe('🏙️ Abbreviations & Variants (additional)', () => {
    test('attractions handles city abbreviation (SF)', async () => {
      // Mock geocoding for SF (San Francisco)
      nock('https://geocoding-api.open-meteo.com')
        .get('/v1/search')
        .query(true)
        .reply(200, {
          results: [{ name: 'San Francisco', latitude: 37.7749, longitude: -122.4194, country: 'United States' }],
        });

      // Mock OpenTripMap for SF attractions
      nock('https://api.opentripmap.com')
        .get(/\/0\.1\/en\/places\/radius.*/)
        .reply(200, {
          features: [
            { properties: { xid: 'SF1', name: 'Golden Gate Bridge', kinds: 'architecture,bridges' }, geometry: { coordinates: [-122.4783, 37.8199] } },
            { properties: { xid: 'SF2', name: 'Alcatraz Island', kinds: 'cultural,historic' }, geometry: { coordinates: [-122.4230, 37.8267] } },
          ],
        });

      const r = await recordedRequest(app, transcriptRecorder, 'attractions_sf_abbreviation', 'What to do in SF?');
      await expectLLMEvaluation(
        'Attractions with SF abbreviation',
        r.body.reply,
        'Response should interpret SF as San Francisco and provide real attractions from OpenTripMap API (Golden Gate Bridge, Alcatraz Island) with OpenTripMap citation'
      ).toPass();
      expect((r.body.citations || []).join(',')).toMatch(/OpenTripMap/i);
    }, 45000);
  });
});

