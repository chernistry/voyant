import { getLastReceipts, setLastReceipts, clearThreadSlots } from '../../src/core/slot_memory.js';
import type { Fact } from '../../src/core/receipts.js';

describe('Policy Receipts Storage', () => {
  const threadId = 'test-thread-policy';

  beforeEach(() => {
    clearThreadSlots(threadId);
  });

  it('should store policy facts with Vectara source', () => {
    const facts: Fact[] = [
      {
        source: 'Vectara',
        key: 'policy_0',
        value: 'https://policy.example.com/airlines',
        url: 'https://policy.example.com/airlines'
      },
      {
        source: 'Vectara',
        key: 'policy_1',
        value: 'https://policy.example.com/hotels',
        url: 'https://policy.example.com/hotels'
      }
    ];
    
    const decisions = ['RAG answer from Vectara corpus for policy query: "What are the carry-on size limits?"'];
    const reply = 'Based on our airline policy, carry-on bags must not exceed 22x14x9 inches.';
    
    setLastReceipts(threadId, facts, decisions, reply);
    
    const receipts = getLastReceipts(threadId);
    
    expect(receipts.facts).toHaveLength(2);
    expect(receipts.facts![0]).toEqual({
      source: 'Vectara',
      key: 'policy_0',
      value: 'https://policy.example.com/airlines',
      url: 'https://policy.example.com/airlines'
    });
    
    expect(receipts.decisions).toHaveLength(1);
    expect(receipts.decisions![0]).toContain('RAG answer from Vectara corpus');
    
    expect(receipts.reply).toBe(reply);
  });

  it('should store policy facts without URLs', () => {
    const facts: Fact[] = [
      {
        source: 'Vectara',
        key: 'policy_0',
        value: 'Internal Policy Doc 1',
        url: undefined
      }
    ];
    
    const decisions = ['RAG answer from Vectara corpus for policy query: "When is hotel check-in?"'];
    
    setLastReceipts(threadId, facts, decisions);
    
    const receipts = getLastReceipts(threadId);
    
    expect(receipts.facts![0]).toEqual({
      source: 'Vectara',
      key: 'policy_0',
      value: 'Internal Policy Doc 1',
      url: undefined
    });
  });

  it('should store no-results receipt', () => {
    const facts: Fact[] = [
      {
        source: 'Vectara',
        key: 'no_results',
        value: 'Internal Knowledge Base (No Results)'
      }
    ];
    
    const decisions = ['Policy query attempted: "What is the pet policy?"'];
    
    setLastReceipts(threadId, facts, decisions);
    
    const receipts = getLastReceipts(threadId);
    
    expect(receipts.facts).toHaveLength(1);
    expect(receipts.facts![0]).toEqual({
      source: 'Vectara',
      key: 'no_results',
      value: 'Internal Knowledge Base (No Results)'
    });
  });

  it('should handle multiple policy citations', () => {
    const facts: Fact[] = Array.from({ length: 5 }, (_, i) => ({
      source: 'Vectara',
      key: `policy_${i}`,
      value: `https://policy.example.com/doc${i}`,
      url: `https://policy.example.com/doc${i}`
    }));
    
    const decisions = ['RAG answer from Vectara corpus for policy query: "What are all the policies?"'];
    
    setLastReceipts(threadId, facts, decisions);
    
    const receipts = getLastReceipts(threadId);
    
    expect(receipts.facts).toHaveLength(5);
    expect(receipts.facts![4]).toEqual({
      source: 'Vectara',
      key: 'policy_4',
      value: 'https://policy.example.com/doc4',
      url: 'https://policy.example.com/doc4'
    });
  });
});
