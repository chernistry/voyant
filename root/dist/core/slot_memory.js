const slotStore = new Map();
export function getThreadSlots(threadId) {
    return slotStore.get(threadId)?.slots ?? {};
}
export function getExpectedMissing(threadId) {
    return slotStore.get(threadId)?.expectedMissing ?? [];
}
export function updateThreadSlots(threadId, slots, expectedMissing = []) {
    const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
    const merged = { ...prev.slots };
    for (const [k, v] of Object.entries(slots)) {
        if (typeof v === 'string' && v.trim().length > 0)
            merged[k] = v;
    }
    slotStore.set(threadId, { ...prev, slots: merged, expectedMissing });
}
export function clearThreadSlots(threadId) {
    slotStore.delete(threadId);
}
export function setLastIntent(threadId, intent) {
    const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
    slotStore.set(threadId, { ...prev, lastIntent: intent });
}
export function getLastIntent(threadId) {
    return slotStore.get(threadId)?.lastIntent;
}
export function setLastReceipts(threadId, facts, decisions, reply) {
    const prev = slotStore.get(threadId) ?? { slots: {}, expectedMissing: [] };
    slotStore.set(threadId, { ...prev, lastFacts: facts, lastDecisions: decisions, lastReply: reply });
}
export function getLastReceipts(threadId) {
    const s = slotStore.get(threadId);
    return { facts: s?.lastFacts, decisions: s?.lastDecisions, reply: s?.lastReply };
}
