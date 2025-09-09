import type { Fact } from './receipts.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

type SlotState = {
  slots: Record<string, string>;
  expectedMissing: string[];
  lastIntent?: 'weather'|'destinations'|'packing'|'attractions'|'policy'|'unknown'|'web_search'|'system';
  lastFacts?: Fact[];
  lastDecisions?: string[];
  lastReply?: string;
};

const slotStore = new Map<string, SlotState>();

// File-based persistence for CLI
const CLI_SLOTS_FILE = path.join(os.tmpdir(), 'voyant-cli-slots.json');
const isCliMode = process.argv.some(arg => arg.includes('cli.ts') || arg.includes('cli.js'));

function loadCliSlots(): Map<string, SlotState> {
  try {
    if (fs.existsSync(CLI_SLOTS_FILE)) {
      const data = fs.readFileSync(CLI_SLOTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.log('🔧 SLOTS: Failed to load CLI slots, starting fresh');
  }
  return new Map();
}

function saveCliSlots(store: Map<string, SlotState>): void {
  try {
    const data = Object.fromEntries(store);
    fs.writeFileSync(CLI_SLOTS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log('🔧 SLOTS: Failed to save CLI slots');
  }
}

export function clearCliSlots(): void {
  if (isCliMode) {
    try {
      if (fs.existsSync(CLI_SLOTS_FILE)) {
        fs.unlinkSync(CLI_SLOTS_FILE);
        console.log('🔧 SLOTS: Cleared CLI slots for fresh start');
      }
    } catch (error) {
      console.log('🔧 SLOTS: Failed to clear CLI slots');
    }
  }
}

export function getThreadSlots(threadId: string): Record<string, string> {
  let store = slotStore;
  
  if (isCliMode) {
    store = loadCliSlots();
  }
  
  const slots = store.get(threadId)?.slots ?? {};
  console.log('🔧 SLOTS: getThreadSlots', { threadId, slots, storeSize: store.size, isCliMode });
  return slots;
}

export function getExpectedMissing(threadId: string): string[] {
  return slotStore.get(threadId)?.expectedMissing ?? [];
}

export function updateThreadSlots(
  threadId: string,
  slots: Record<string, string>,
  expectedMissing: string[] = [],
): void {
  let store = slotStore;
  
  if (isCliMode) {
    store = loadCliSlots();
  }
  
  const prev = store.get(threadId) ?? { slots: {}, expectedMissing: [] };
  const merged: Record<string, string> = { ...prev.slots };
  for (const [k, v] of Object.entries(slots)) {
    if (typeof v === 'string' && v.trim().length > 0) merged[k] = v;
  }
  
  console.log('🔧 SLOTS: updateThreadSlots', { 
    threadId, 
    newSlots: slots, 
    prevSlots: prev.slots, 
    mergedSlots: merged,
    isCliMode
  });
  
  store.set(threadId, { ...prev, slots: merged, expectedMissing });
  
  if (isCliMode) {
    saveCliSlots(store);
  }
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


