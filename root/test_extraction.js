#!/usr/bin/env node

// Simple test for LLM-based policy extraction
import { callLLM } from './dist/core/llm.js';
import { getPrompt } from './dist/core/prompts.js';

async function testExtraction() {
  console.log('🧪 Testing LLM-based policy extraction...\n');
  
  // Mock airline policy text
  const mockPolicyText = `
    El Al Israel Airlines Carry-On Baggage Policy
    
    Passengers are allowed to bring one carry-on bag and one personal item aboard the aircraft.
    
    Carry-on bag dimensions:
    - Maximum size: 56cm x 45cm x 25cm (22" x 18" x 10")
    - Maximum weight: 8kg (17.6 lbs)
    
    Personal item dimensions:
    - Maximum size: 40cm x 30cm x 15cm (16" x 12" x 6")
    - Examples: handbag, laptop bag, small backpack
    
    Items exceeding these limits must be checked as baggage and are subject to applicable fees.
  `;
  
  try {
    // Test policy extraction
    const extractorPrompt = await getPrompt('policy_extractor');
    const prompt = extractorPrompt
      .replace('{{clauseType}}', 'baggage')
      .replace('{{sourceText}}', mockPolicyText);
    
    console.log('📝 Extracting policy clause...');
    const extractedText = await callLLM(prompt, { responseFormat: 'text' });
    
    console.log('✅ Extracted text:');
    console.log(`"${extractedText}"`);
    
    // Test confidence scoring
    const confidencePrompt = await getPrompt('policy_confidence');
    const confidenceInput = confidencePrompt
      .replace('{{clauseType}}', 'baggage')
      .replace('{{extractedText}}', extractedText)
      .replace('{{sourceUrl}}', 'https://elal.com/baggage');
    
    console.log('\n📊 Scoring confidence...');
    const confidenceStr = await callLLM(confidenceInput, { responseFormat: 'text' });
    const confidence = parseFloat(confidenceStr.trim()) || 0;
    
    console.log(`✅ Confidence: ${(confidence * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

testExtraction().catch(console.error);
