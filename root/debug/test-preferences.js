import { extractTravelPreferences } from '../dist/core/preference-extractor.js';

async function test() {
  try {
    console.log('Testing preference extraction...');
    const result = await extractTravelPreferences('family trip with kids');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
