#!/usr/bin/env tsx

import { VectaraClient } from '../src/tools/vectara.js';

/**
 * Test Vectara queries with sample policy questions.
 * Usage: npm run test-vectara
 */
async function main() {
  console.log('🔍 Testing Vectara policy queries...\n');

  const client = new VectaraClient();

  const testQueries = [
    { query: 'United baggage allowance carry-on dimensions', corpus: 'airlines' as const },
    { query: 'Delta cancellation policy 24 hours', corpus: 'airlines' as const },
    { query: 'Marriott hotel cancellation fee', corpus: 'hotels' as const },
    { query: 'Hilton check-in time early arrival', corpus: 'hotels' as const },
    { query: 'USA ESTA visa waiver requirements', corpus: 'visas' as const },
    { query: 'Schengen visa 90 days Europe', corpus: 'visas' as const },
  ];

  for (const { query, corpus } of testQueries) {
    console.log(`\n📋 Query: "${query}" (${corpus})`);
    console.log('─'.repeat(60));
    
    try {
      const result = await client.query(query, { corpus, maxResults: 3 });
      
      if (result.summary) {
        console.log(`💡 Summary: ${result.summary}`);
      }
      
      if (result.hits.length > 0) {
        console.log(`\n📄 Top results (${result.hits.length}):`);
        result.hits.forEach((hit, i) => {
          console.log(`${i + 1}. ${hit.title || 'Untitled'}`);
          console.log(`   Score: ${hit.score?.toFixed(3) || 'N/A'}`);
          console.log(`   Snippet: ${hit.snippet?.slice(0, 100) || 'No snippet'}...`);
          if (hit.url) console.log(`   URL: ${hit.url}`);
        });
      } else {
        console.log('❌ No results found');
      }
      
      if (result.citations.length > 0) {
        console.log(`\n📚 Citations (${result.citations.length}):`);
        result.citations.forEach((cite, i) => {
          console.log(`${i + 1}. ${cite.title || cite.text?.slice(0, 50) || 'Citation'}`);
        });
      }
      
    } catch (error) {
      console.log(`❌ Query failed: ${error}`);
    }
  }
  
  console.log('\n✅ Testing complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Testing failed:', error);
    process.exit(1);
  });
}
