import request from 'supertest';
import express from 'express';
import { router } from '../../src/api/routes.js';

const app = express();
app.use(express.json());
app.use('/chat', router);

describe('E2E: Chaotic Conversation Flow', () => {
  let threadId: string;

  beforeAll(() => {
    threadId = `chaotic-${Date.now()}`;
  });

  test('extreme_topic_jumping_12_turns', async () => {
    // 1. Flight search
    const response1 = await request(app)
      .post('/chat')
      .send({ message: 'flights from moscow to tel aviv 12-10-2025 one way', threadId });

    expect(response1.status).toBe(200);
    expect(response1.body.reply).toContain('flight');
    
    // 2. Weather query
    const response2 = await request(app)
      .post('/chat')
      .send({ message: "What's the weather like in Barcelona today?", threadId });

    expect(response2.status).toBe(200);
    expect(response2.body.reply).toContain('weather');
    
    // 3. Packing advice
    const response3 = await request(app)
      .post('/chat')
      .send({ message: 'What should I pack for this weather?', threadId });

    expect(response3.status).toBe(200);
    expect(response3.body.reply).toContain('pack');
    
    // 4. Attractions
    const response4 = await request(app)
      .post('/chat')
      .send({ message: 'What are some must-see attractions in Barcelona?', threadId });

    expect(response4.status).toBe(200);
    expect(response4.body.reply).toContain('attraction');
    
    // 5. Complex planning with consent
    const response5 = await request(app)
      .post('/chat')
      .send({ 
        message: 'From NYC, end of June (last week), 4-5 days. 2 adults + toddler. Looking for family-friendly accommodations near the beach with a pool. I also want to check if I need any specific vaccinations for the trip and find the best local restaurants.', 
        threadId 
      });

    expect(response5.status).toBe(200);
    // Should trigger consent for deep research
    expect(response5.body.reply).toMatch(/deep research|consent|proceed/i);
    
    // 6. Consent acceptance → Deep research
    const response6 = await request(app)
      .post('/chat')
      .send({ message: 'yes', threadId });

    expect(response6.status).toBe(200);
    // Should execute deep research
    expect(response6.body.reply).not.toBeNull();
    
    // 7. Topic switch to restaurants
    const response7 = await request(app)
      .post('/chat')
      .send({ message: 'Actually, I\'d like to know about restaurants for kids in Barcelona.', threadId });

    expect(response7.status).toBe(200);
    expect(response7.body.reply).toMatch(/restaurant|food|kids/i);
    
    // 8. Another consent acceptance
    const response8 = await request(app)
      .post('/chat')
      .send({ message: 'Yes', threadId });

    expect(response8.status).toBe(200);
    // Should execute another research
    expect(response8.body.reply).not.toBeNull();
    
    // 9. Visa question
    const response9 = await request(app)
      .post('/chat')
      .send({ message: 'Quick one: do US passport holders need visa for Canada?', threadId });

    expect(response9.status).toBe(200);
    expect(response9.body.reply).toMatch(/visa|passport|require/i);
    
    // 10. /why command
    const response10 = await request(app)
      .post('/chat')
      .send({ message: '/why', threadId });

    expect(response10.status).toBe(200);
    // Should show receipts/citations
    expect(response10.body.reply).toMatch(/source|citation|based on/i);
    
    // 11. New packing query
    const response11 = await request(app)
      .post('/chat')
      .send({ message: 'What should I pack for London?', threadId });

    expect(response11.status).toBe(200);
    expect(response11.body.reply).toContain('pack');
    
    // 12. Policy question
    const response12 = await request(app)
      .post('/chat')
      .send({ message: 'What is the standard cancellation window for Marriott hotels?', threadId });

    expect(response12.status).toBe(200);
    expect(response12.body.reply).toMatch(/policy|cancellation|Marriott/i);
  }, 30000); // Increased timeout for complex E2E test
});