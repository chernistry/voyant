import { getAttractions } from './dist/tools/attractions.js';

async function test() {
  console.log('Testing getAttractions for Rome...');

  const result = await getAttractions({ city: 'Rome', limit: 3 });

  console.log('Result:', result);

  if (result.ok) {
    console.log('✅ SUCCESS - Source:', result.source);
  } else {
    console.log('❌ FAILED - Reason:', result.reason);
  }
}

test().catch(console.error);
