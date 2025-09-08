// Quick test to verify LLM summarization works for attractions
import { getAttractions } from '../dist/tools/attractions.js';

async function testAttractions() {
  console.log('Testing kid-friendly attractions in Paris...');
  
  const result = await getAttractions({
    city: 'Paris',
    limit: 5,
    profile: 'kid_friendly'
  });
  
  console.log('Result:', result);
  
  if (result.ok) {
    console.log('\n✅ Success! Summary:');
    console.log(result.summary);
    console.log('\nSource:', result.source);
  } else {
    console.log('\n❌ Failed:', result.reason);
  }
}

testAttractions().catch(console.error);
