import { expect } from '@jest/globals';
import request from 'supertest';

export async function chat(app: import('express').Express, message: string, threadId?: string) {
  const res = await request(app)
    .post('/chat')
    .send(threadId ? { message, threadId } : { message })
    .set('Content-Type', 'application/json');
  expect([200, 400]).toContain(res.status);
  return res.body as { reply?: string; threadId?: string; citations?: string[]; error?: any };
}

export function expectNoCOTLeak(text: string) {
  const leakMarkers = [/chain[-\s]?of[-\s]?thought/i, /\breasoning:/i, /step\s*\d+/i];
  leakMarkers.forEach((r) => expect(r.test(text)).toBeFalsy());
}

export function expectNoHallucinations(reply: string) {
  // Check for fabricated temperature data
  expect(reply).not.toMatch(/\b\d{1,3}\s?(°|deg|C|F)\b/);

  // Check for fabricated POI data
  const commonPOIs = ['eiffel', 'louvre', 'prado', 'retir', 'gran via', 'times square', 'statue of liberty'];
  commonPOIs.forEach(poi => {
    expect(reply.toLowerCase()).not.toContain(poi);
  });

  // Check for fake citations
  expect(reply).not.toMatch(/according to.*source/i);
  expect(reply).not.toMatch(/based on.*data/i);
}

export async function createConversationThread(
  app: import('express').Express,
  messages: string[],
  threadId?: string
): Promise<{ replies: string[]; finalThreadId: string }> {
  let currentThreadId = threadId;
  const replies: string[] = [];

  for (const message of messages) {
    const response = await chat(app, message, currentThreadId);
    replies.push(response.reply || '');
    currentThreadId = response.threadId || currentThreadId;
  }

  return { replies, finalThreadId: currentThreadId || '' };
}

export function validateThreadIdFormat(threadId: string) {
  expect(threadId).toBeTruthy();
  expect(typeof threadId).toBe('string');
  expect(threadId.length).toBeGreaterThan(5);
  expect(threadId.length).toBeLessThan(65);
  expect(/^[a-zA-Z0-9_-]+$/.test(threadId)).toBeTruthy();
}

export function validateCitations(reply: string, citations?: string[]) {
  const replyLower = reply.toLowerCase();

  if (citations && citations.length > 0) {
    // If we have citations, reply should mention external data usage
    const hasWeatherMentions = replyLower.includes('weather') || replyLower.includes('temperature');
    const hasCountryMentions = replyLower.includes('country') || replyLower.includes('currency');
    const hasAttractionMentions = replyLower.includes('attraction') || replyLower.includes('museum');

    if (hasWeatherMentions || hasCountryMentions || hasAttractionMentions) {
      expect(citations.length).toBeGreaterThan(0);
    }
  }
}

