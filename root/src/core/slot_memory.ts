import type { Fact, Decision } from './receipts.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const isDebugMode = process.env.LOG_LEVEL === 'debug';

function debugLog(message: string, data?: any) {
  if (isDebugMode) {
    console.debug(message, data);
  }
}

type SlotState = {
  slots: Record<string, string>;
  expectedMissing: string[];
  lastIntent?: 'weather'|'destinations'|'packing'|'attractions'|'policy'|'flights'|'unknown'|'web_search'|'system';
  lastFacts?: Fact[];
  lastDecisions?: Array<string | Decision>;
  lastReply?: string;
};

const slotStore = new Map<string, SlotState>();

// File-based persistence for CLI
const CLI_SLOTS_FILE = path.join(os.tmpdir(), 'voyant-cli-slots.json');

function isCliMode(): boolean {
  return process.argv.some(arg => arg.includes('cli.ts') || arg.includes('cli.js')) || 
         process.env.NODE_ENV === 'cli' ||
         process.title.includes('cli');
}

function loadCliSlots(): Map<string, SlotState> {
  try {
    if (fs.existsSync(CLI_SLOTS_FILE)) {
      const data = fs.readFileSync(CLI_SLOTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      const loaded = new Map(Object.entries(parsed)) as Map<string, SlotState>;
      debugLog('🔧 SLOTS: Loaded CLI slots from file', { path: CLI_SLOTS_FILE, entries: loaded.size });
      return loaded;
    } else {
      debugLog('🔧 SLOTS: CLI slots file does not exist, starting fresh', { path: CLI_SLOTS_FILE });
    }
  } catch (error) {
    debugLog('🔧 SLOTS: Failed to load CLI slots, starting fresh', { error: String(error), path: CLI_SLOTS_FILE });
  }
  return new Map();
}

function saveCliSlots(store: Map<string, SlotState>): void {
  try {
    const data = Object.fromEntries(store);
    fs.writeFileSync(CLI_SLOTS_FILE, JSON.stringify(data, null, 2));
    debugLog('🔧 SLOTS: Saved CLI slots to file', { path: CLI_SLOTS_FILE, entries: store.size });
  } catch (error) {
    debugLog('🔧 SLOTS: Failed to save CLI slots', { error: String(error), path: CLI_SLOTS_FILE });
  }
}

export function clearCliSlots(): void {
  if (isCliMode()) {
    try {
      if (fs.existsSync(CLI_SLOTS_FILE)) {
        fs.unlinkSync(CLI_SLOTS_FILE);
        debugLog('🔧 SLOTS: Cleared CLI slots for fresh start');
      }
    } catch (error) {
      debugLog('🔧 SLOTS: Failed to clear CLI slots');
    }
  }
}

export function getThreadSlots(threadId: string): Record<string, string> {
  let store = slotStore;
  
  if (isCliMode()) {
    store = loadCliSlots();
    // Sync main store with file store
    for (const [id, state] of store.entries()) {
      slotStore.set(id, state);
    }
  }
  
  const slots = store.get(threadId)?.slots ?? {};
  debugLog('🔧 SLOTS: getThreadSlots', { threadId, slots, storeSize: store.size, isCliMode: isCliMode() });
  return slots;
}

export function getExpectedMissing(threadId: string): string[] {
  return slotStore.get(threadId)?.expectedMissing ?? [];
}

export function updateThreadSlots(
  threadId: string,
  slots: Record<string, string | null>,
  expectedMissing: string[] = [],
): void {
  // Filter out null values
  const filteredSlots: Record<string, string> = {};
  for (const [k, v] of Object.entries(slots)) {
    if (typeof v === 'string' && v.trim().length > 0) {
      filteredSlots[k] = v;
    }
  }

  let store = slotStore;
  
  if (isCliMode()) {
    store = loadCliSlots();
  }
  
  const prev = store.get(threadId) ?? { slots: {}, expectedMissing: [] };
  const merged: Record<string, string> = { ...prev.slots, ...filteredSlots };
  
  debugLog('🔧 SLOTS: updateThreadSlots', { 
    threadId, 
    newSlots: filteredSlots, 
    prevSlots: prev.slots, 
    mergedSlots: merged,
    isCliMode: isCliMode()
  });
  
  const newState = { ...prev, slots: merged, expectedMissing };
  store.set(threadId, newState);
  
  // Also update the main store in CLI mode for consistency
  if (isCliMode()) {
    slotStore.set(threadId, newState);
    saveCliSlots(store);
  }
}

export function clearThreadSlots(threadId: string): void {
  slotStore.delete(threadId);
}

export function setLastIntent(threadId: string, intent: 'weather'|'destinations'|'packing'|'attractions'|'policy'|'flights'|'unknown'|'web_search'|'system'): void {
  const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
  slotStore.set(threadId, { ...prev, lastIntent: intent });
}

export function getLastIntent(threadId: string): 'weather'|'destinations'|'packing'|'attractions'|'policy'|'flights'|'unknown'|'web_search'|'system'|undefined {
  return slotStore.get(threadId)?.lastIntent;
}

export function setLastReceipts(
  threadId: string,
  facts: Fact[],
  decisions: Array<string | Decision>,
  reply?: string,
): void {
  const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
  slotStore.set(threadId, { ...prev, lastFacts: facts, lastDecisions: decisions, lastReply: reply });
}

export function getLastReceipts(threadId: string): { facts?: Fact[]; decisions?: Array<string | Decision>; reply?: string } {
  const s = slotStore.get(threadId);
  return { facts: s?.lastFacts, decisions: s?.lastDecisions, reply: s?.lastReply };
}

export function normalizeSlots(
  prior: Record<string, string>, 
  extracted: Record<string, string | null>,
  intent?: string
): Record<string, string> {
  const out = { ...prior };
  const safe: Record<string, string> = {};

  // Convert null values to empty strings and filter out
  for (const [key, value] of Object.entries(extracted)) {
    if (value !== null && typeof value === 'string' && value.trim()) {
      safe[key] = value;
    }
  }

  // 1) Strip "today/now" from city/destination fields
  for (const k of ['city', 'destinationCity', 'originCity']) {
    if (typeof safe[k] === 'string') {
      safe[k] = safe[k].replace(/\b(today|now)\b/gi, '').trim();
      // Reject if contains digits or is empty after cleanup
      if (/\d/.test(safe[k]) || !safe[k]) delete safe[k];
    }
  }

  // 2) Don't backfill month/dates from "today" for non-flight intents.
  // For flights we must preserve relative dates like "today"/"tomorrow".
  if (intent !== 'flights') {
    if (safe.month && /today|now/i.test(safe.month)) delete safe.month;
    if (safe.dates && /today|now/i.test(safe.dates)) delete safe.dates;
  }

  // 2b) For flights, map relative dates into departureDate if missing
  if (intent === 'flights') {
    if (safe.dates && !safe.departureDate && /^(today|tomorrow|tonight)$/i.test(safe.dates)) {
      safe.departureDate = safe.dates;
    }
  }

  // 3) Intent-scoped writes to prevent cross-contamination
  if (intent === 'weather') {
    // Weather queries should not write flight-related slots
    delete safe.originCity;
    delete safe.destinationCity;
    delete safe.dates; // Don't persist dates from "today"
    delete safe.month;
  }

  // 4) Apply existing filtering logic
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(safe)) {
    if (typeof value === 'string' && value.trim()) {
      const v = value.toLowerCase();
      const placeholderTokens = ['unknown', 'clean_city_name', 'there', 'normalized_name'];
      const datePlaceholders = ['unknown', 'next week', 'normalized_date_string', 'month_name'];
      
      if (key === 'city') {
        if (placeholderTokens.includes(v)) continue;
        const looksProper = /^[A-Z][A-Za-z\- ]+$/.test(value);
        const genericWords = ['city', 'destination', 'place'];
        const containsGeneric = genericWords.some(w => v.includes(w));
        if (!looksProper || containsGeneric) continue;
        filtered[key] = value;
        continue;
      }
      
      if (!datePlaceholders.includes(v)) {
        filtered[key] = value;
      }
    }
  }

  return { ...out, ...filtered };
}

export function readConsentState(slots: Record<string, string>) {
  return {
    awaiting: !!(slots.awaiting_search_consent === 'true' || slots.awaiting_deep_research_consent === 'true' || slots.awaiting_web_search_consent === 'true'),
    type: slots.awaiting_search_consent === 'true' ? 'web' : 
          slots.awaiting_deep_research_consent === 'true' ? 'deep' : 
          slots.awaiting_web_search_consent === 'true' ? 'web_after_rag' : '',
    pending: slots.pending_search_query || slots.pending_deep_research_query || slots.pending_web_search_query || ''
  };
}

export function writeConsentState(threadId: string, next: { type: 'web' | 'deep' | 'web_after_rag' | '', pending: string }) {
  const updates: Record<string, string> = {
    awaiting_search_consent: '',
    pending_search_query: '',
    awaiting_deep_research_consent: '',
    pending_deep_research_query: '',
    awaiting_web_search_consent: '',
    pending_web_search_query: ''
  };
  
  if (next.type === 'web') {
    updates.awaiting_search_consent = 'true';
    updates.pending_search_query = next.pending;
  } else if (next.type === 'deep') {
    updates.awaiting_deep_research_consent = 'true';
    updates.pending_deep_research_query = next.pending;
  } else if (next.type === 'web_after_rag') {
    updates.awaiting_web_search_consent = 'true';
    updates.pending_web_search_query = next.pending;
  }
  
  updateThreadSlots(threadId, updates, []);
}

