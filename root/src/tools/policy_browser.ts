import crypto from 'node:crypto';
import { observeExternal } from '../util/metrics.js';
import { withBreaker } from '../util/circuit.js';
import { scheduleWithLimit } from '../util/limiter.js';
import { callLLM } from '../core/llm.js';
import { getPrompt } from '../core/prompts.js';
import { PolicyReceiptSchema, type ClauseTypeT, type PolicyReceipt } from '../schemas/policy.js';
import type { CheerioCrawlingContext, PlaywrightCrawlingContext } from 'crawlee';

const PNG_MAX = 2_000_000;

export async function extractPolicyClause(params: {
  url: string;
  clause: ClauseTypeT;
  engine?: 'playwright' | 'cheerio';
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<PolicyReceipt> {
  const t0 = Date.now();
  const url = params.url;
  const host = new URL(url).hostname;

  try {
    const timeoutSecs = Math.ceil((params.timeoutMs ?? 30000) / 1000); // 30 second default
    
    console.log(`🎯 Policy extraction: ${host} - Using Playwright ONLY (Crawlee disabled)`);
    
    // Use only Playwright with advanced stealth - no Crawlee fallback
    return await scheduleWithLimit(host, async () => {
      return await withBreaker(host, async () => {
        const result = await withPlaywright(url, params.clause, timeoutSecs);
        return PolicyReceiptSchema.parse(result);
      });
    });
    
  } finally {
    observeExternal({ target: 'policy_browser', status: 'ok' }, Date.now() - t0);
  }
}

async function withPlaywright(url: string, clause: ClauseTypeT, timeoutSecs: number) {
  const { chromium } = await import('playwright');
  
  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const blockResources = process.env.PLAYWRIGHT_BLOCK_RESOURCES?.split(',').map(s => s.trim()) || ['image', 'font', 'media'];
  
  console.log(`🎭 ${headless ? 'Headless' : 'Headful'} mode with advanced stealth`);
  
  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(headless ? ['--disable-extensions-except=/dev/null', '--disable-extensions'] : []),
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-ipc-flooding-protection'
    ]
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { 
        width: 1366 + Math.floor(Math.random() * 200), 
        height: 768 + Math.floor(Math.random() * 200) 
      },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"'
      }
    });
    
    const page = await context.newPage();
    
    // Advanced stealth - comprehensive anti-detection
    await page.addInitScript(() => {
      // Remove webdriver traces
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      
      // Spoof plugins (from research)
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', length: 1 },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', length: 1 },
          { name: 'Native Client', filename: 'internal-nacl-plugin', length: 1 }
        ]
      });
      
      // Fix missing properties in headless
      if (!window.outerHeight) {
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
      }
      
      // Spoof WebGL context (from research)
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
        if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
        return getParameter.call(this, parameter);
      };
      
      // Spoof hardware concurrency and device memory (from research)
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      
      // Add chrome object
      if (!(window as any).chrome) {
        (window as any).chrome = { 
          runtime: { 
            onConnect: undefined,
            onMessage: undefined 
          },
          app: {
            isInstalled: false
          }
        };
      }
      
      // Disable WebRTC and AudioContext (from research)
      (window as any).RTCPeerConnection = undefined;
      (window as any).AudioContext = undefined;
      (window as any).webkitRTCPeerConnection = undefined;
      (window as any).webkitAudioContext = undefined;
      
      // Spoof battery API (from research)
      if ((navigator as any).getBattery) {
        (navigator as any).getBattery = () => Promise.resolve({
          charging: false,
          chargingTime: Infinity,
          dischargingTime: 14400, // 4 hours
          level: 0.73 + Math.random() * 0.2 // 73-93%
        });
      }
      
      // Spoof permissions
      if (navigator.permissions) {
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = (parameters: any) => {
          if (parameters.name === 'notifications') {
            return Promise.resolve({ 
              state: 'default',
              name: 'notifications',
              onchange: null,
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false
            } as any);
          }
          return originalQuery.call(navigator.permissions, parameters);
        };
      }
    });
    
    // Block resources based on config
    await page.route('**/*', async (route: any) => {
      const resourceType = route.request().resourceType();
      if (blockResources.includes(resourceType)) {
        await route.abort();
      } else {
        await route.continue();
      }
    });
    
    console.log(`🌐 Navigating to ${url} with full stealth`);
    
    // Navigate with extended timeout
    await page.goto(url, { 
      timeout: timeoutSecs * 1000, 
      waitUntil: 'domcontentloaded' 
    });
    
    // Wait for JavaScript SPA to load - comprehensive content detection
    console.log('⏳ Waiting for content to fully load...');
    await page.waitForTimeout(3000); // Initial wait
    
    // Smart content detection - wait for policy content specifically
    try {
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        const hasContent = text.length > 1000;
        const hasPolicy = /baggage|carry.?on|luggage|policy|refund|size|weight|limit|dimension|fee|allow/gi.test(text);
        const notLoading = !text.includes('Loading') && !text.includes('CSS Error');
        const notMath = !/Question:|Answer:|Let [a-z] =|Suppose/g.test(text);
        
        return hasContent && hasPolicy && notLoading && notMath;
      }, { timeout: 15000 });
      console.log('✅ Policy content detected and loaded');
    } catch {
      console.log('⚠️ Timeout waiting for policy content, proceeding with current state');
    }
    
    // Human-like behavior simulation (faster version)
    console.log('🤖 Quick human behavior simulation...');
    
    // Quick mouse movements
    for (let i = 0; i < 2; i++) {
      const x = Math.random() * 1366;
      const y = Math.random() * 768;
      await page.mouse.move(x, y);
      await page.waitForTimeout(100 + Math.random() * 200); // Faster
    }
    
    // Quick scrolling
    for (let i = 0; i < 2; i++) {
      const scrollAmount = 200 + Math.random() * 300;
      await page.mouse.wheel(0, scrollAmount);
      await page.waitForTimeout(300 + Math.random() * 500); // Faster
    }
    
    // Shorter final wait
    await page.waitForTimeout(500 + Math.random() * 1000); // Much faster
    
    // Extract content
    const fullText = await page.evaluate(() => document.body.innerText);
    const title = await page.title();
    
    console.log(`📄 Extracted ${fullText.length} chars: "${title}"`);
    
    const extractedClause = await extractClauseWithLLM(fullText, clause, url);
    
    // Screenshot for receipt
    let png: Buffer | undefined;
    try {
      png = await page.screenshot({ 
        fullPage: true, 
        timeout: 5000,
        type: 'png'
      });
    } catch (error) {
      console.log('📸 Screenshot failed, continuing without it');
    }
    
    const hash = crypto.createHash('sha256').update(`${url}\n${extractedClause.quote}`).digest('hex');
    const imgPath = png && png.byteLength <= PNG_MAX ? await persistPng(url, png) : undefined;
    
    return {
      url,
      title,
      hash,
      capturedAt: new Date().toISOString(),
      quote: extractedClause.quote,
      imgPath,
      confidence: extractedClause.confidence,
      source: classifySource(url)
    };
    
  } finally {
    await browser.close();
  }
}

async function withCheerio(url: string, clause: ClauseTypeT, timeoutMs: number) {
  const { CheerioCrawler, createCheerioRouter } = await import('crawlee');
  let receipt: any | undefined;
  
  const router = createCheerioRouter();
  router.addDefaultHandler(async (ctx: CheerioCrawlingContext) => {
    const { $, request } = ctx;
    
    // Extract all text content
    const fullText = $('body').text().replace(/\s+/g, ' ').trim();
    const title = $('title').text().trim() || new URL(request.url).hostname;
    
    // Use LLM to extract relevant policy clause
    const extractedClause = await extractClauseWithLLM(fullText, clause, request.url);
    const hash = crypto.createHash('sha256').update(`${request.url}\n${extractedClause.quote}`).digest('hex');
    
    receipt = {
      url: request.url,
      title,
      hash,
      capturedAt: new Date().toISOString(),
      quote: extractedClause.quote,
      confidence: extractedClause.confidence,
      source: classifySource(request.url)
    };
  });
  
  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: Math.ceil(timeoutMs / 1000),
    requestHandler: router,
    maxRequestRetries: 2,
    failedRequestHandler: async ({ request, error }) => {
      console.warn(`Cheerio failed for ${request.url}:`, String(error));
    }
  });
  
  try {
    await crawler.run([url]);
  } catch (error) {
    console.warn('Cheerio crawler error:', error);
  }
  
  return receipt ?? {
    url,
    title: new URL(url).hostname,
    hash: crypto.createHash('sha256').update(url).digest('hex'),
    capturedAt: new Date().toISOString(),
    quote: '',
    confidence: 0,
    source: classifySource(url)
  };
}

/**
 * AI-first clause extraction using LLM
 */
async function extractClauseWithLLM(
  fullText: string, 
  clause: ClauseTypeT, 
  sourceUrl: string
): Promise<{ quote: string; confidence: number }> {
  try {
    // Increase context window significantly - 32k tokens (~128k chars)
    const truncatedText = fullText.slice(0, 8000);
    
    console.log(`🔍 LLM Extraction Debug:`);
    console.log(`- URL: ${sourceUrl}`);
    console.log(`- Text length: ${fullText.length} -> ${truncatedText.length}`);
    console.log(`- First 300 chars: "${truncatedText.slice(0, 300)}"`);
    console.log(`- Contains "El Al": ${truncatedText.includes('El Al') || truncatedText.includes('EL AL')}`);
    console.log(`- Contains "British Airways": ${truncatedText.includes('British Airways')}`);
    
    // Check for anti-bot indicators
    const antiBot = {
      mathQuestions: /Question:|Answer:|Let [a-z] =|Suppose|Which is|What is the/g.test(truncatedText),
      cppCode: /class|struct|public:|private:|#include/g.test(truncatedText),
      randomMath: /\d+\*[a-z]\*\*\d+|\d+\s*\+\s*-\d+/g.test(truncatedText),
      jsGarbage: /Loading×Sorry to interrupt|CSS Error|slds-modal|forceChatter|flexipage/g.test(truncatedText),
      salesforce: /builder_industries|flowengine|forceCommunity/g.test(truncatedText),
      hasRealContent: /baggage|policy|refund|size|weight|limit|dimension|fee|allow/gi.test(truncatedText)
    };
    
    console.log(`- Anti-bot check: math=${antiBot.mathQuestions}, cpp=${antiBot.cppCode}, js=${antiBot.jsGarbage}, real=${antiBot.hasRealContent}`);
    
    // Block garbage content
    const hasGarbageContent = antiBot.mathQuestions || antiBot.cppCode || antiBot.randomMath || antiBot.jsGarbage || antiBot.salesforce;
    const hasMinimalRealContent = truncatedText.split(/baggage|policy|refund|size|weight|limit|dimension|fee|allow/gi).length < 5;
    
    if (hasGarbageContent && (hasMinimalRealContent || !antiBot.hasRealContent)) {
      console.log(`❌ Anti-bot content detected, skipping extraction`);
      return { quote: '', confidence: 0 };
    }
    
    // Extract with LLM - emphasize the specific airline
    const extractorPrompt = await getPrompt('policy_extractor');
    const enhancedPrompt = `${extractorPrompt}

CRITICAL: You are extracting policy information from ${new URL(sourceUrl).hostname}. 
Pay close attention to the SPECIFIC AIRLINE mentioned in the content.
If this is El Al content, extract EL AL policies, NOT other airlines.

IMPORTANT: Look for specific baggage policy information including:
- Size limits (dimensions in cm or inches)
- Weight limits (kg or lbs) 
- Number of bags allowed
- Fees and restrictions
- Official policy language

Extract the most relevant and specific policy text about ${clause} from the CORRECT airline mentioned in the source.`;

    const prompt = enhancedPrompt
      .replace('{{clauseType}}', clause)
      .replace('{{sourceText}}', truncatedText);
    
    console.log(`- Sending ${truncatedText.length} chars to LLM for ${clause} extraction...`);
    
    const extractedText = await callLLM(prompt, { responseFormat: 'text' });
    
    // Decode HTML entities
    const decodedText = extractedText
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'");
    
    console.log(`- LLM response length: ${decodedText.length}`);
    console.log(`- LLM response FULL: "${decodedText}"`);
    console.log(`- Contains dimensions: ${/\d+cm|\d+in|dimensions|size/gi.test(decodedText)}`);
    console.log(`- Contains 56cm: ${decodedText.includes('56cm')}`);
    console.log(`- Contains 22in: ${decodedText.includes('22in')}`);
    
    if (!decodedText.trim() || decodedText.length < 10) {
      console.log(`❌ LLM response too short`);
      return { quote: '', confidence: 0 };
    }
    
    // Check if it's actually policy content
    const isPolicyContent = /baggage|bag|luggage|carry.?on|checked|size|weight|limit|dimension|policy|allow|refund|cancel/i.test(decodedText);
    console.log(`- Is policy content: ${isPolicyContent}`);
    
    if (!isPolicyContent) {
      console.log(`❌ LLM response not policy content`);
      return { quote: decodedText.trim().slice(0, 1000), confidence: 0.1 };
    }
    
    // Score confidence
    const confidencePrompt = await getPrompt('policy_confidence') as string;
    console.log(`- Raw confidence prompt length: ${confidencePrompt.length}`);
    
    const confidenceInput = confidencePrompt
      .replace('{{clauseType}}', clause)
      .replace('{{extractedText}}', decodedText.slice(0, 500)) // Limit to avoid token overflow
      .replace('{{sourceUrl}}', sourceUrl);
    
    console.log(`- Final confidence prompt length: ${confidenceInput.length}`);
    console.log(`- Confidence prompt preview: "${confidenceInput.slice(0, 200)}..."`);
    
    const confidenceStr = await callLLM(confidenceInput, { responseFormat: 'text' });
    
    // Parse confidence more robustly
    let confidence = 0;
    const confidenceMatch = confidenceStr.match(/(\d+\.?\d*)/);
    if (confidenceMatch && confidenceMatch[1]) {
      confidence = parseFloat(confidenceMatch[1]);
      // If it's a whole number > 1, assume it's a percentage
      if (confidence > 1) confidence = confidence / 100;
      // Final clamp into [0,1]
      confidence = Math.max(0, Math.min(1, confidence));
    }
    
    console.log(`- Raw confidence response: "${confidenceStr.trim()}"`);
    console.log(`- Parsed confidence: ${confidence}`);
    console.log(`✅ Final result: ${extractedText.length} chars, ${(confidence * 100).toFixed(0)}% confidence`);
    
    return {
      quote: decodedText.trim().slice(0, 1000),
      confidence
    };
  } catch (error) {
    console.warn('❌ LLM extraction failed:', error);
    return { quote: '', confidence: 0 };
  }
}

function classifySource(url: string): 'airline' | 'hotel' | 'visa' | 'generic' {
  const h = new URL(url).hostname;
  if (/visa|gov|state\.gov|embassy|consulate/.test(h)) return 'visa';
  if (/hotel|inn|marriott|hilton|hyatt|sheraton|westin|courtyard|residence/.test(h)) return 'hotel';
  if (/airline|united|delta|american|southwest|jetblue|alaska|spirit|frontier/.test(h)) return 'airline';
  return 'generic';
}

async function persistPng(url: string, buf: Buffer): Promise<string> {
  const dir = process.env.POLICY_RECEIPTS_DIR || 'assets/receipts';
  const name = `${Date.now()}-${Buffer.from(url).toString('base64').slice(0, 12)}.png`;
  const fs = await import('node:fs/promises');
  const p = `${dir}/${name}`;
  
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(p, buf);
  return p;
}
