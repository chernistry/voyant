import pino from 'pino';

jest.mock('../src/tools/weather.js', () => ({
  getWeather: async () => ({ ok: true, summary: 'High 30°C / Low 22°C; precip prob 20%' })
}));
jest.mock('../src/tools/country.js', () => ({
  getCountryFacts: async () => ({ ok: true, summary: 'Japan • Region: Asia • Currency: JPY • Language: Japanese' })
}));
jest.mock('../src/tools/attractions.js', () => ({
  getAttractions: async () => ({ ok: false, reason: 'no_pois' })
}));

describe('Packing suggestions integration', () => {
  test('includes packing list when weather fetched and intent is packing', async () => {
    const { blendWithFacts } = await import('../../src/core/blend.js');
    const log = pino({ level: 'silent' });
    const input = {
      message: 'What to pack for Tokyo in March?',
      route: { intent: 'packing', needExternal: true, slots: { city: 'Tokyo', month: 'March' }, confidence: 0.9 },
    } as const;
    const { reply, citations } = await blendWithFacts(input as any, { log });
    expect(citations).toEqual(expect.arrayContaining(['Open-Meteo']));
    expect(reply).toMatch(/pack/i);
    expect(reply).toMatch(/light.*clothing/i);
    expect(reply).toMatch(/sunscreen/i);
  }, 45000);
});


