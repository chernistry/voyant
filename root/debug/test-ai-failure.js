import { extractTravelPreferences } from '../dist/core/preference-extractor.js';

async function test() {
  try {
    console.log('Testing AI cascade...');
    
    // Test 1: Should use AI (NLP or LLM)
    const aiResult = await extractTravelPreferences('family trip with kids');
    console.log('AI Success:', JSON.stringify(aiResult, null, 2));
    
    // Test 2: Should fail and show AI failure
    const failResult = await extractTravelPreferences('xyz random nonsense');
    console.log('AI Failure:', JSON.stringify(failResult, null, 2));
    
    // Test 3: Romantic should use AI
    const romanticResult = await extractTravelPreferences('romantic honeymoon getaway');
    console.log('Romantic AI:', JSON.stringify(romanticResult, null, 2));
    
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
