/**
 * Test: Slot normalization prevents pollution
 */

import { normalizeSlots } from '../../../src/core/slot_memory.js';

describe('Slot Normalization', () => {
  test('should strip "today" from city fields', () => {
    const prior = {};
    const extracted = { city: 'Barcelona today' };
    
    const result = normalizeSlots(prior, extracted, 'weather');
    
    expect(result.city).toBe('Barcelona');
  });

  test('should reject city fields with digits', () => {
    const prior = {};
    const extracted = { city: 'Barcelona 12-10-2025' };
    
    const result = normalizeSlots(prior, extracted, 'weather');
    
    expect(result.city).toBeUndefined();
  });

  test('should not write flight slots for weather intent', () => {
    const prior = {};
    const extracted = { 
      city: 'Barcelona',
      destinationCity: 'Madrid',
      originCity: 'London',
      dates: 'today'
    };
    
    const result = normalizeSlots(prior, extracted, 'weather');
    
    expect(result.city).toBe('Barcelona');
    expect(result.destinationCity).toBeUndefined();
    expect(result.originCity).toBeUndefined();
    expect(result.dates).toBeUndefined();
  });

  test('should reject month/dates containing "today"', () => {
    const prior = {};
    const extracted = { 
      month: 'September today',
      dates: 'today'
    };
    
    const result = normalizeSlots(prior, extracted, 'weather');
    
    expect(result.month).toBeUndefined();
    expect(result.dates).toBeUndefined();
  });
});
