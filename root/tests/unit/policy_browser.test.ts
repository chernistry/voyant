import { describe, it, expect, beforeEach } from '@jest/globals';
import { PolicyReceiptSchema, ClauseType } from '../../src/schemas/policy.js';
import { savePolicyReceipt, getPolicyReceipts, clearPolicyReceipts } from '../../src/core/policy_receipts.js';

describe('Policy Browser', () => {
  beforeEach(() => {
    clearPolicyReceipts('test-thread');
  });

  describe('PolicyReceiptSchema', () => {
    it('validates valid receipt', () => {
      const receipt = {
        url: 'https://united.com/baggage',
        title: 'United Baggage Policy',
        hash: 'a'.repeat(64),
        capturedAt: new Date().toISOString(),
        quote: 'Checked bags up to 50 lbs are included in your fare.',
        confidence: 0.85,
        source: 'airline' as const
      };

      expect(() => PolicyReceiptSchema.parse(receipt)).not.toThrow();
    });

    it('rejects invalid hash', () => {
      const receipt = {
        url: 'https://united.com/baggage',
        title: 'United Baggage Policy',
        hash: 'invalid-hash',
        capturedAt: new Date().toISOString(),
        quote: 'Checked bags up to 50 lbs are included in your fare.',
        confidence: 0.85,
        source: 'airline' as const
      };

      expect(() => PolicyReceiptSchema.parse(receipt)).toThrow();
    });
  });

  describe('ClauseType', () => {
    it('accepts valid clause types', () => {
      expect(() => ClauseType.parse('baggage')).not.toThrow();
      expect(() => ClauseType.parse('refund')).not.toThrow();
      expect(() => ClauseType.parse('change')).not.toThrow();
      expect(() => ClauseType.parse('visa')).not.toThrow();
    });

    it('rejects invalid clause types', () => {
      expect(() => ClauseType.parse('invalid')).toThrow();
    });
  });

  describe('Policy Receipts Storage', () => {
    it('saves and retrieves receipts', () => {
      const receipt = {
        url: 'https://united.com/baggage',
        title: 'United Baggage Policy',
        hash: 'a'.repeat(64),
        capturedAt: new Date().toISOString(),
        quote: 'Test policy text',
        confidence: 0.8,
        source: 'airline' as const
      };

      savePolicyReceipt('test-thread', receipt);
      const retrieved = getPolicyReceipts('test-thread');
      
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toEqual(receipt);
    });

    it('handles multiple receipts per thread', () => {
      const receipt1 = {
        url: 'https://united.com/baggage',
        title: 'United Baggage Policy',
        hash: 'a'.repeat(64),
        capturedAt: new Date().toISOString(),
        quote: 'Test policy text 1',
        confidence: 0.8,
        source: 'airline' as const
      };

      const receipt2 = {
        url: 'https://united.com/refund',
        title: 'United Refund Policy',
        hash: 'b'.repeat(64),
        capturedAt: new Date().toISOString(),
        quote: 'Test policy text 2',
        confidence: 0.9,
        source: 'airline' as const
      };

      savePolicyReceipt('test-thread', receipt1);
      savePolicyReceipt('test-thread', receipt2);
      
      const retrieved = getPolicyReceipts('test-thread');
      expect(retrieved).toHaveLength(2);
    });
  });
});
