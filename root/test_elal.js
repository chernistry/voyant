#!/usr/bin/env node

/**
 * Standalone El Al Website Extraction Test
 * Tests various Playwright techniques to bypass anti-bot protection
 */

import { chromium } from 'playwright';

const EL_AL_URL = 'https://www.elal.com/eng/baggage/hand-baggage';

// Test configurations
const TECHNIQUES = [
  {
    name: 'Basic Headless',
    config: {
      headless: true,
      args: []
    }
  },
  {
    name: 'Stealth Headless',
    config: {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox'
      ]
    }
  },
  {
    name: 'Headful Mode',
    config: {
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security'
      ]
    }
  },
  {
    name: 'Stealth + No Resource Blocking',
    config: {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox'
      ],
      blockResources: false
    }
  },
  {
    name: 'Stealth + Minimal Blocking',
    config: {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox'
      ],
      blockResources: ['image', 'media']
    }
  }
];

async function testTechnique(technique) {
  console.log(`\n🧪 Testing: ${technique.name}`);
  console.log('='.repeat(50));
  
  const browser = await chromium.launch(technique.config);
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    const page = await context.newPage();
    
    // Advanced stealth scripts
    await page.addInitScript(() => {
      // Remove webdriver traces
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      
      // Spoof plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ]
      });
      
      // Fix missing properties
      if (!window.outerHeight) {
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
      }
      
      // Spoof WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };
      
      // Add chrome object
      if (!window.chrome) {
        window.chrome = { runtime: {} };
      }
    });
    
    // Resource blocking
    if (technique.config.blockResources !== false) {
      const resourcesToBlock = technique.config.blockResources || ['image', 'font', 'media', 'stylesheet'];
      await page.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        if (resourcesToBlock.includes(resourceType)) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
      console.log(`🚫 Blocking: ${resourcesToBlock.join(', ')}`);
    } else {
      console.log('✅ No resource blocking');
    }
    
    console.log('🌐 Navigating to El Al...');
    const startTime = Date.now();
    
    // Navigate
    await page.goto(EL_AL_URL, { 
      timeout: 30000, 
      waitUntil: 'domcontentloaded' 
    });
    
    console.log(`⏱️  Navigation took: ${Date.now() - startTime}ms`);
    
    // Wait for content
    console.log('⏳ Waiting for content to load...');
    await page.waitForTimeout(5000);
    
    // Try to wait for specific content
    try {
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return text.length > 1000 && 
               (text.includes('baggage') || text.includes('carry-on') || text.includes('luggage'));
      }, { timeout: 15000 });
      console.log('✅ Policy content detected!');
    } catch {
      console.log('⚠️  Timeout waiting for policy content');
    }
    
    // Extract content
    const title = await page.title();
    const fullText = await page.evaluate(() => document.body.innerText);
    const url = page.url();
    
    console.log(`📄 Title: "${title}"`);
    console.log(`🔗 Final URL: ${url}`);
    console.log(`📝 Content length: ${fullText.length} characters`);
    
    // Analyze content
    const hasRealContent = /baggage|carry.?on|luggage|size|weight|limit|dimension/gi.test(fullText);
    const hasMathQuestions = /Question:|Answer:|Let [a-z] =|Suppose/g.test(fullText);
    const hasJSGarbage = /Loading.*Sorry to interrupt|CSS Error|slds-modal/g.test(fullText);
    
    console.log(`✅ Has real baggage content: ${hasRealContent}`);
    console.log(`❌ Has math questions (anti-bot): ${hasMathQuestions}`);
    console.log(`❌ Has JS garbage: ${hasJSGarbage}`);
    
    // Show content preview
    console.log('\n📋 Content Preview (first 500 chars):');
    console.log('-'.repeat(50));
    console.log(fullText.slice(0, 500));
    console.log('-'.repeat(50));
    
    if (fullText.length > 500) {
      console.log('\n📋 Content Preview (middle 500 chars):');
      console.log('-'.repeat(50));
      const middle = Math.floor(fullText.length / 2);
      console.log(fullText.slice(middle, middle + 500));
      console.log('-'.repeat(50));
    }
    
    // Success criteria
    const isSuccess = hasRealContent && !hasMathQuestions && !hasJSGarbage && fullText.length > 1000;
    
    console.log(`\n🎯 SUCCESS: ${isSuccess ? '✅ YES' : '❌ NO'}`);
    
    if (isSuccess) {
      console.log('🎉 TECHNIQUE WORKED! El Al content successfully extracted.');
      
      // Take screenshot for proof
      try {
        const screenshot = await page.screenshot({ 
          path: `elal_success_${technique.name.replace(/\s+/g, '_').toLowerCase()}.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot saved: elal_success_${technique.name.replace(/\s+/g, '_').toLowerCase()}.png`);
      } catch (e) {
        console.log('📸 Screenshot failed:', e.message);
      }
    }
    
    return {
      technique: technique.name,
      success: isSuccess,
      contentLength: fullText.length,
      hasRealContent,
      hasMathQuestions,
      hasJSGarbage,
      title,
      finalUrl: url
    };
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return {
      technique: technique.name,
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

async function testStealthwright() {
  console.log(`\n🚀 Testing: Stealthwright`);
  console.log('='.repeat(50));
  
  try {
    const stealthwright = await import('stealthwright');
    const browser = await chromium.launch({ headless: true });
    
    const context = await stealthwright.default(browser);
    const page = await context.newPage();
    
    console.log('🌐 Navigating with Stealthwright...');
    await page.goto(EL_AL_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
    
    await page.waitForTimeout(5000);
    
    const title = await page.title();
    const fullText = await page.evaluate(() => document.body.innerText);
    
    console.log(`📄 Title: "${title}"`);
    console.log(`📝 Content length: ${fullText.length} characters`);
    
    const hasRealContent = /baggage|carry.?on|luggage|size|weight|limit|dimension/gi.test(fullText);
    const hasMathQuestions = /Question:|Answer:|Let [a-z] =|Suppose/g.test(fullText);
    
    console.log(`✅ Has real baggage content: ${hasRealContent}`);
    console.log(`❌ Has math questions (anti-bot): ${hasMathQuestions}`);
    
    console.log('\n📋 Content Preview:');
    console.log('-'.repeat(50));
    console.log(fullText.slice(0, 500));
    console.log('-'.repeat(50));
    
    const isSuccess = hasRealContent && !hasMathQuestions && fullText.length > 1000;
    console.log(`\n🎯 SUCCESS: ${isSuccess ? '✅ YES' : '❌ NO'}`);
    
    await browser.close();
    
    return {
      technique: 'Stealthwright',
      success: isSuccess,
      contentLength: fullText.length,
      hasRealContent,
      hasMathQuestions
    };
    
  } catch (error) {
    console.log(`❌ Stealthwright ERROR: ${error.message}`);
    return {
      technique: 'Stealthwright',
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('🎯 El Al Website Extraction Test Suite');
  console.log('Testing various Playwright techniques to bypass anti-bot protection');
  console.log('Target:', EL_AL_URL);
  console.log('\n');
  
  const results = [];
  
  // Test all techniques
  for (const technique of TECHNIQUES) {
    const result = await testTechnique(technique);
    results.push(result);
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Test Stealthwright
  const stealthwrightResult = await testStealthwright();
  results.push(stealthwrightResult);
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL RESULTS SUMMARY');
  console.log('='.repeat(80));
  
  results.forEach(result => {
    const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
    const content = result.contentLength ? `${result.contentLength} chars` : 'N/A';
    console.log(`${status} | ${result.technique.padEnd(25)} | ${content}`);
    if (result.error) {
      console.log(`         Error: ${result.error}`);
    }
  });
  
  const successfulTechniques = results.filter(r => r.success);
  
  if (successfulTechniques.length > 0) {
    console.log(`\n🎉 SUCCESS! ${successfulTechniques.length} technique(s) worked:`);
    successfulTechniques.forEach(t => console.log(`   - ${t.technique}`));
    console.log('\nUse the successful technique in your main application!');
  } else {
    console.log('\n😞 No techniques worked. El Al has very strong anti-bot protection.');
    console.log('Consider:');
    console.log('   - Using residential proxies');
    console.log('   - Adding more human-like delays');
    console.log('   - Using browser profiles with history');
    console.log('   - Manual solving of CAPTCHAs');
  }
}

// Run the test
main().catch(console.error);
