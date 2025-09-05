import { callLLM } from '../core/llm.js';

type CrawlResult = {
  url: string;
  title: string;
  content: string;
  summary?: string;
};

export async function deepResearchPages(urls: string[], query: string): Promise<{
  ok: boolean;
  results: CrawlResult[];
  summary?: string;
}> {
  if (urls.length === 0) return { ok: false, results: [] };
  
  try {
    // Dynamic import to handle missing dependency gracefully
    const { CheerioCrawler } = await import('crawlee');
    
    const results: CrawlResult[] = [];
    const maxPages = Math.min(urls.length, parseInt(process.env.CRAWLEE_MAX_PAGES || '8'));
    
    console.log(`🔍 Crawlee config: CRAWLEE_MAX_PAGES=${process.env.CRAWLEE_MAX_PAGES}, maxPages=${maxPages}, urls.length=${urls.length}`);
    
    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: maxPages,
      requestHandlerTimeoutSecs: 15,
      async requestHandler({ $, request }) {
        try {
          const title = $('title').text().trim();
          const content = extractMainContent($);
          
          console.log(`📄 Crawling: ${request.url}`);
          console.log(`📝 Title: ${title.slice(0, 100)}${title.length > 100 ? '...' : ''}`);
          console.log(`📊 Content length: ${content.length} chars`);
          
          if (content.length > 100) {
            results.push({
              url: request.url,
              title,
              content: content.slice(0, 2000)
            });
            console.log(`✅ Added to results (${results.length}/${maxPages})`);
          } else {
            console.log(`❌ Content too short, skipping`);
          }
        } catch (e) {
          console.warn(`❌ Failed to process ${request.url}:`, e);
        }
      },
      failedRequestHandler({ request }) {
        console.warn(`Failed to crawl: ${request.url}`);
      },
    });

    await crawler.run(urls.slice(0, maxPages));
    
    if (results.length === 0) {
      console.log(`❌ No content extracted from any pages`);
      return { ok: false, results: [] };
    }
    
    console.log(`📋 Successfully crawled ${results.length} pages, starting summarization...`);
    
    // Summarize each page
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result) continue;
      
      console.log(`🤖 Summarizing page ${i + 1}/${results.length}: ${result.title.slice(0, 50)}...`);
      result.summary = await summarizePage(result.content, query);
      console.log(`✅ Summary: ${result.summary.slice(0, 100)}...`);
    }
    
    // Create overall summary
    console.log(`🔄 Creating overall summary from ${results.length} page summaries...`);
    const overallSummary = await createOverallSummary(results, query);
    console.log(`📊 Final summary: ${overallSummary.slice(0, 150)}...`);
    
    return {
      ok: true,
      results,
      summary: overallSummary
    };
  } catch (error) {
    console.error('Crawlee error:', error);
    return { ok: false, results: [] };
  }
}

function extractMainContent($: any): string {
  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar').remove();
  
  // Try to find main content
  const mainSelectors = ['main', 'article', '.content', '.post', '.entry', '.main-content'];
  for (const selector of mainSelectors) {
    const main = $(selector).first();
    if (main.length && main.text().trim().length > 200) {
      return main.text().trim();
    }
  }
  
  // Fallback to body
  return $('body').text().trim();
}

async function summarizePage(content: string, query: string): Promise<string> {
  const prompt = `Summarize this webpage content in 2-3 sentences, focusing on information relevant to: "${query}"

Content: ${content.slice(0, 1500)}

Summary:`;

  try {
    const response = await callLLM(prompt);
    return response.trim();
  } catch {
    return 'Summary unavailable';
  }
}

async function createOverallSummary(results: CrawlResult[], query: string): Promise<string> {
  if (results.length === 0) return '';
  
  const summaries = results.map((r, i) => `[${i + 1}] ${r.title}: ${r.summary}`).join('\n');
  
  const prompt = `Create a comprehensive 2-3 paragraph summary based on these webpage summaries for the query: "${query}"

Summaries:
${summaries}

Comprehensive Summary:`;

  try {
    const response = await callLLM(prompt);
    return response.trim();
  } catch {
    return 'Overall summary unavailable';
  }
}
