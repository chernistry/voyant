import type { PolicyReceipt } from '../schemas/policy.js';

// Simple in-memory storage for receipts (thread-scoped)
const receiptStore = new Map<string, PolicyReceipt[]>();

export function savePolicyReceipt(threadId: string, receipt: PolicyReceipt): void {
  const existing = receiptStore.get(threadId) || [];
  existing.push(receipt);
  receiptStore.set(threadId, existing);
}

export function getPolicyReceipts(threadId: string): PolicyReceipt[] {
  return receiptStore.get(threadId) || [];
}

export function clearPolicyReceipts(threadId: string): void {
  receiptStore.delete(threadId);
}
