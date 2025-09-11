import { scrubMessage, scrubPII } from '../../src/util/redact.js';

describe('Security: Redaction & Allowlist', () => {
  test('scrubMessage redacts dates and cities', () => {
    const msg = 'Trip to Paris on 2025-03-10..2025-03-18 in Paris';
    const out = scrubMessage(msg, true);
    expect(out).not.toContain('Paris');
    expect(out).toContain('[REDACTED_DATES]');
    expect(out).toContain('[REDACTED_CITY]');
  });

  test('scrubPII redacts nested strings in objects', () => {
    const payload = { a: 'in Tokyo', b: { c: '2024-12-01' } };
    const out = scrubPII(payload, true) as any;
    expect(out.a).toContain('[REDACTED_CITY]');
    expect(out.b.c).toBe('[REDACTED_DATE]');
  });
});


