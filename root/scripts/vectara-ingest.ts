#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { VectaraClient } from '../src/tools/vectara.js';

/**
 * Ingest test policy documents into Vectara corpora.
 * Usage: npm run ingest-policies
 */
async function main() {
  console.log('🚀 Starting Vectara policy ingestion...\n');

  const client = new VectaraClient();
  const baseDir = path.join(process.cwd(), 'data', 'policies');

  // Ingest airlines policies
  console.log('📋 Ingesting airlines policies...');
  await ingestCorpus(client, path.join(baseDir, 'airlines'), 'airlines');

  // Ingest hotels policies  
  console.log('\n🏨 Ingesting hotels policies...');
  await ingestCorpus(client, path.join(baseDir, 'hotels'), 'hotels');

  // Ingest visas policies
  console.log('\n🛂 Ingesting visas policies...');
  await ingestCorpus(client, path.join(baseDir, 'visas'), 'visas');

  console.log('\n✅ Ingestion complete! Ready to test queries.');
  console.log('\nTest queries:');
  console.log('- "What is United baggage allowance?"');
  console.log('- "Delta cancellation policy"');
  console.log('- "Marriott check-out time"');
  console.log('- "Do I need visa for Europe?"');
}

async function ingestCorpus(
  client: VectaraClient, 
  dir: string, 
  corpus: 'airlines' | 'hotels' | 'visas'
) {
  try {
    const files = await fs.readdir(dir);
    
    for (const file of files) {
      if (!file.endsWith('.txt')) continue;
      
      const filePath = path.join(dir, file);
      const text = await fs.readFile(filePath, 'utf-8');
      const title = file.replace('.txt', '').replace(/-/g, ' ');
      const id = `${corpus}-${file.replace('.txt', '')}`;
      
      console.log(`  📄 Indexing: ${title}`);
      
      try {
        await client.index({
          id,
          corpus,
          title,
          text,
          url: `https://example.com/${corpus}/${file}`,
          meta: {
            source: corpus,
            filename: file,
            last_updated: '2024-01-01'
          }
        });
        console.log(`  ✅ Success: ${id}`);
      } catch (error) {
        console.log(`  ❌ Failed: ${id} - ${error}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${dir}:`, error);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Ingestion failed:', error);
    process.exit(1);
  });
}
