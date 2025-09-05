import pino from 'pino';
import { classifyContentLLM, clarifierLLM, extractCityLLM, parseDatesLLM } from '../../src/core/nlp.js';

const log = pino({ level: 'silent' });

describe('nlp wrappers', () => {
  test('classifyContentLLM returns structured result for travel question', async () => {
    const res = await classifyContentLLM('Weather in Paris in June', log);
    expect(res).toBeTruthy();
    expect(res && typeof res.content_type).toBe('string');
    expect(res && typeof res.is_explicit_search).toBe('boolean');
  });

  test('clarifierLLM fallback produces stable phrasing for missing city+dates', async () => {
    const q = await clarifierLLM(['city', 'dates'], {}, log);
    expect(q.toLowerCase()).toContain('city');
    expect(q.toLowerCase()).toContain('dates');
  });

  test('extractCityLLM and parseDatesLLM fallbacks extract from simple input', async () => {
    const city = await extractCityLLM('Weather in Tokyo next week', {}, log);
    expect(city && city.length).toBeGreaterThan(0);
    const dates = await parseDatesLLM('Weather in Tokyo next week', {}, log);
    expect(dates && (dates.dates || dates.month)).toBeTruthy();
  });
});

