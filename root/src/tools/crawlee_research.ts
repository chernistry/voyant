import { callLLM } from '../core/llm.js';
import { getPrompt } from '../core/prompts.js';

const DEBUG = process.env.LOG_LEVEL === 'debug';

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
  
  const engine = process.env.CRAWLEE_ENGINE || 'cheerio';
  if (DEBUG) console.debug(`🔍 Crawlee engine: ${engine}`);
  
  try {
    const results: CrawlResult[] = [];
    const maxPages = Math.min(urls.length, parseInt(process.env.CRAWLEE_MAX_PAGES || '4'));
    
    if (DEBUG) console.debug(`🔍 Crawlee config: CRAWLEE_ENGINE=${engine}, CRAWLEE_MAX_PAGES=${process.env.CRAWLEE_MAX_PAGES}, maxPages=${maxPages}, urls.length=${urls.length}`);
    
    if (engine === 'playwright') {
      await runPlaywrightCrawler(urls, maxPages, results);
    } else {
      await runCheerioCrawler(urls, maxPages, results);
    }
    
    if (results.length === 0) {
      if (DEBUG) console.debug(`❌ No content extracted from any pages`);
      return { ok: false, results: [] };
    }
    if (DEBUG) console.debug(`📋 Successfully crawled ${results.length} pages, starting summarization...`);
    
    // Summarize each page
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result) continue;
      
      if (DEBUG) console.debug(`🤖 Summarizing page ${i + 1}/${results.length}: ${result.title.slice(0, 50)}...`);
      result.summary = await summarizePage(result.content, query);
      if (DEBUG) console.debug(`✅ Summary: ${result.summary.slice(0, 100)}...`);
    }
    
    // Create overall summary
    if (DEBUG) console.debug(`🔄 Creating overall summary from ${results.length} page summaries...`);
    const overallSummary = await createOverallSummary(results, query);
    if (DEBUG) console.debug(`📊 Final summary: ${overallSummary.slice(0, 150)}...`);
    
    return {
      ok: true,
      results,
      summary: overallSummary
    };
  } catch (error) {
    if (DEBUG) console.error('Crawlee error:', error);
    
    // Fallback: return basic search results without deep crawling
    const fallbackResults = urls.slice(0, 3).map((url, i) => ({
      url,
      title: `Search Result ${i + 1}`,
      content: `This page contains information relevant to: ${query}`,
      summary: `Relevant information about ${query} can be found at this source.`
    }));
    
    return { 
      ok: true, 
      results: fallbackResults,
      summary: `Based on search results, here are some options for: ${query}. Due to technical limitations, detailed page analysis was not available, but these sources contain relevant information.`
    };
  }
}

async function runCheerioCrawler(urls: string[], maxPages: number, results: CrawlResult[]): Promise<void> {
  // Dynamic import to handle missing dependency gracefully
  const { CheerioCrawler } = await import('crawlee');
  
  const failedUrls: string[] = [];
  
  // Clean up storage before starting
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const storageDir = path.join(process.cwd(), 'storage');
    await fs.rm(storageDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
  
  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: maxPages,
    requestHandlerTimeoutSecs: 15,
    async requestHandler({ $, request }) {
      try {
        const title = $('title').text().trim();
        const content = extractMainContent($);
        
        console.log(`📄 Crawling (Cheerio): ${request.url}`);
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
        failedUrls.push(request.url);
      }
    },
    failedRequestHandler({ request }) {
      console.warn(`Failed to crawl: ${request.url}`);
      failedUrls.push(request.url);
    },
  });

  await crawler.run(urls.slice(0, maxPages));
  
  // Retry failed URLs with Playwright if available
  if (failedUrls.length > 0) {
    if (DEBUG) console.debug(`🔄 Retrying ${failedUrls.length} failed URLs with Playwright...`);
    try {
      await runPlaywrightCrawler(failedUrls, failedUrls.length, results);
    } catch (e) {
      if (DEBUG) console.warn(`❌ Playwright fallback also failed:`, e);
    }
  }
}

async function runPlaywrightCrawler(urls: string[], maxPages: number, results: CrawlResult[]): Promise<void> {
  // Dynamic import to handle missing dependency gracefully
  const { PlaywrightCrawler } = await import('crawlee');
  
  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: maxPages,
    requestHandlerTimeoutSecs: 15,
    navigationTimeoutSecs: 10,
    launchContext: {
      launchOptions: {
        headless: true,
        timeout: 10000
      }
    },
    async requestHandler({ page, request }) {
      try {
        // Wait for main content selectors with timeout
        const contentSelectors = ['main', 'article', '.content', 'body'];
        let content = '';
        let title = '';
        
        try {
          // Get title
          title = await page.title();
          
          // Try to wait for and extract from main content areas
          for (const selector of contentSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000 });
              const element = await page.$(selector);
              if (element) {
                const text = await element.innerText();
                if (text && text.trim().length > 200) {
                  content = text.trim();
                  break;
                }
              }
            } catch {
              // Continue to next selector
            }
          }
          
          // Fallback to page content if no main content found
          if (!content || content.length < 100) {
            content = await page.content();
            // Strip HTML tags for plain text
            content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                           .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                           .replace(/<[^>]*>/g, ' ')
                           .replace(/\s+/g, ' ')
                           .trim();
          }
        } catch (e) {
          console.warn(`❌ Failed to extract content from ${request.url}:`, e);
          return;
        }
        
        console.log(`📄 Crawling (Playwright): ${request.url}`);
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
  const tpl = await getPrompt('crawlee_page_summary');
  const prompt = tpl
    .replace('{query}', query)
    .replace('{content}', content.slice(0, 16000));

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
  
  const tpl = await getPrompt('crawlee_overall_summary');
  const prompt = tpl
    .replace('{query}', query)
    .replace('{summaries}', summaries);

  try {
    const response = await callLLM(prompt);
    return response.trim();
  } catch {
    return 'Overall summary unavailable';
  }
}
