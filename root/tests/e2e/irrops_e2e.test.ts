import { describe, it, expect } from '@jest/globals';
import { runGraphTurn } from '../../src/core/graph.js';
import { updateThreadSlots } from '../../src/core/slot_memory.js';
import pino from 'pino';

describe('IRROPS End-to-End', () => {
  const logger = pino({ level: 'silent' });
  const threadId = 'test-thread-irrops';

  beforeEach(() => {
    // Set up mock PNR data in thread slots
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureDate = tomorrow.toISOString();
    
    updateThreadSlots(threadId, {
      pnr_record_locator: 'ABC123',
      originCity: 'JFK',
      destinationCity: 'LAX',
      departure_date: futureDate,
      passenger_count: '1'
    });
  });

  it('should handle flight cancellation message', async () => {
    const message = 'My flight AA123 from JFK to LAX was cancelled, please help me rebook';
    
    const result = await runGraphTurn(message, threadId, { log: logger });
    
    expect(result).toMatchObject({
      done: true,
      reply: expect.any(String)
    });
    
    if ('reply' in result) {
      // Should provide assistance even if no alternatives found
      expect(result.reply.length).toBeGreaterThan(50);
      expect(result.reply).toMatch(/rebooking|options|assistance|airline/i);
    }
  });

  it('should handle flight delay message', async () => {
    const message = 'Flight delayed 3 hours due to weather, need alternatives';
    
    const result = await runGraphTurn(message, threadId, { log: logger });
    
    expect(result).toMatchObject({
      done: true,
      reply: expect.any(String)
    });
    
    if ('reply' in result) {
      // Should provide some form of assistance
      expect(result.reply.length).toBeGreaterThan(50);
    }
  });

  it('should handle equipment change message', async () => {
    const message = 'Equipment changed from 777 to 737, any issues with my booking?';
    
    const result = await runGraphTurn(message, threadId, { log: logger });
    
    expect(result).toMatchObject({
      done: true,
      reply: expect.any(String)
    });
  });
});
