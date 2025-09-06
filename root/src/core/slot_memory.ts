import type { Fact } from './receipts.js';

type SlotState = {
  slots: Record<string, string>;
  expectedMissing: string[];
  lastIntent?: 'weather'|'destinations'|'packing'|'attractions'|'policy'|'unknown'|'web_search'|'system';
  lastFacts?: Fact[];
  lastDecisions?: string[];
  lastReply?: string;
};

const slotStore = new Map<string, SlotState>();

export function getThreadSlots(threadId: string): Record<string, string> {
  return slotStore.get(threadId)?.slots ?? {};
}

export function getExpectedMissing(threadId: string): string[] {
  return slotStore.get(threadId)?.expectedMissing ?? [];
}

export function updateThreadSlots(
  threadId: string,
  slots: Record<string, string>,
  expectedMissing: string[] = [],
): void {
  const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
  const merged: Record<string, string> = { ...prev.slots };
  for (const [k, v] of Object.entries(slots)) {
    if (typeof v === 'string' && v.trim().length > 0) merged[k] = v;
  }
  slotStore.set(threadId, { ...prev, slots: merged, expectedMissing });
}

export function clearThreadSlots(threadId: string): void {
  slotStore.delete(threadId);
}

export function setLastIntent(threadId: string, intent: 'weather'|'destinations'|'packing'|'attractions'|'policy'|'unknown'|'web_search'|'system'): void {
  const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
  slotStore.set(threadId, { ...prev, lastIntent: intent });
}

export function getLastIntent(threadId: string): 'weather'|'destinations'|'packing'|'attractions'|'policy'|'unknown'|'web_search'|'system'|undefined {
  return slotStore.get(threadId)?.lastIntent;
}

export function setLastReceipts(
  threadId: string,
  facts: Fact[],
  decisions: string[],
  reply?: string,
): void {
  const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
  slotStore.set(threadId, { ...prev, lastFacts: facts, lastDecisions: decisions, lastReply: reply });
}

export function getLastReceipts(threadId: string): { facts?: Fact[]; decisions?: string[]; reply?: string } {
  const s = slotStore.get(threadId);
  return { facts: s?.lastFacts, decisions: s?.lastDecisions, reply: s?.lastReply };
}


