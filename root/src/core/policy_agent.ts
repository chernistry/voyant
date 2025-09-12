import type pino from 'pino';
import { VectaraClient } from '../tools/vectara.js';
import { VECTARA } from '../config/vectara.js';
import { callLLM } from './llm.js';
import { extractEntities } from './ner.js';
import { getPrompt } from './prompts.js';

export type PolicyAnswer = { 
  answer: string; 
  citations: Array<{ url?: string; title?: string; snippet?: string; score?: number }>; 
  needsWebSearch?: boolean;
  assessmentReason?: string;
  wantReceipts?: boolean;
  receipts?: Array<{ url: string; quote: string; confidence: number; imgPath?: string }>;
};

/**
 * Policy agent that orchestrates Vectara retrieval and formats citations.
 */
export class PolicyAgent {
  private vectara = new VectaraClient();

  async answer(
    question: string, 
    corpusHint?: 'airlines' | 'hotels' | 'visas', 
    threadId?: string, 
    log?: pino.Logger,
    wantReceipts?: boolean
  ): Promise<PolicyAnswer> {
    if (!VECTARA.ENABLED) {
      throw new Error('Vectara RAG is disabled');
    }

    const corpus = await this.pickCorpus(question, corpusHint, log);
    
    if (log?.debug) {
      log.debug({ question, corpus, corpusHint }, '🔍 PolicyAgent: Querying Vectara');
    }

    const res = await this.vectara.query(question, { corpus, maxResults: 6 });

    // Filter citations by FCS (Factual Consistency Score) > 0.8
    const highQualityCitations = (res.citations.length ? res.citations : res.hits)
      .filter(c => (c.score ?? 0) > 0.8)
      .slice(0, 5)
      .map(c => ({
        url: c.url,
        title: c.title,
        snippet: ('text' in c ? c.text : ('snippet' in c ? c.snippet : '')) || '',
        score: c.score, // Include score for debugging
      }));

    // If no high-quality citations, fall back to top 3 regardless of score
    const citations = highQualityCitations.length > 0 
      ? highQualityCitations
      : (res.citations.length ? res.citations : res.hits)
          .slice(0, 3)
          .map(c => ({
            url: c.url,
            title: c.title,
            snippet: ('text' in c ? c.text : ('snippet' in c ? c.snippet : '')) || '',
            score: c.score,
          }));

    const answer = res.summary || await this.summarizeWithLLM(question, citations, log);

    // Assess information quality to determine if web search is needed
    const avgScore = citations.length > 0 ? (citations.reduce((sum, c) => sum + (c.score || 0), 0) / citations.length) : 0;
    const assessment = await this.assessInformationQuality(question, answer, citations, avgScore, log);

    if (log?.debug) {
      const totalCitations = (res.citations.length ? res.citations : res.hits).length;
      const highQualityCount = (res.citations.length ? res.citations : res.hits).filter(c => (c.score ?? 0) > 0.8).length;
      
      log.debug({ 
        citationsCount: citations.length,
        totalCitations,
        highQualityCount,
        fcsThreshold: 0.8,
        hasSummary: !!res.summary,
        usedLLMSummary: !res.summary && citations.length > 0,
        avgScore: avgScore.toFixed(3),
        needsWebSearch: assessment.needsWebSearch,
        assessmentReason: assessment.reason
      }, '✅ PolicyAgent: Retrieved policy answer with FCS filtering');
    }

    // Try browser mode if receipts wanted and quality is low
    let receipts: Array<{ url: string; quote: string; confidence: number; imgPath?: string }> | undefined;
    if (wantReceipts && (assessment.needsWebSearch || avgScore < 0.7)) {
      receipts = await this.tryBrowserMode(question, citations, threadId, log);
    }

    return { 
      answer, 
      citations, 
      needsWebSearch: assessment.needsWebSearch,
      assessmentReason: assessment.reason,
      wantReceipts,
      receipts
    };
  }

  private async summarizeWithLLM(
    question: string,
    citations: Array<{ title?: string; snippet?: string }>,
    log?: pino.Logger
  ): Promise<string> {
    if (!citations.length) {
      return 'No policy summary available.';
    }

    const context = citations
      .filter(c => c.snippet?.trim())
      .map((c, i) => `[${i + 1}] ${c.title || 'Policy Document'}\n${c.snippet}`)
      .join('\n\n');

    const tpl = await getPrompt('policy_summarizer');
    const prompt = tpl
      .replace('{question}', question)
      .replace('{context}', context);

    try {
      const response = await callLLM(prompt, { log });
      return response.trim();
    } catch (error) {
      if (log?.warn) {
        log.warn({ error: String(error) }, 'LLM summarization failed, using fallback');
      }
      return this.composeFromHits(citations);
    }
  }

  private async pickCorpus(
    q: string, 
    hint?: 'airlines' | 'hotels' | 'visas',
    log?: pino.Logger
  ): Promise<'airlines' | 'hotels' | 'visas'> {
    if (hint) return hint;
    
    // STEP 1: Try Transformers.js NLP first
    if (log?.debug) {
      log.debug({ step: 1, method: 'transformers' }, '🤖 CORPUS_SELECTION: Attempting Transformers.js NLP');
    }
    
    try {
      const entities = await extractEntities(q, log);
      const corpusFromEntities = this.classifyCorpusFromEntities(entities);
      if (corpusFromEntities) {
        if (log?.debug) {
          log.debug({ 
            step: 1, 
            method: 'transformers', 
            corpus: corpusFromEntities, 
            entities: entities.length 
          }, '✅ CORPUS_SELECTION: Transformers.js succeeded');
        }
        return corpusFromEntities;
      }
    } catch (error) {
      if (log?.debug) {
        log.debug({ error: String(error) }, '❌ CORPUS_SELECTION: Transformers.js failed');
      }
    }

    // STEP 2: Try LLM classification
    if (log?.debug) {
      log.debug({ step: 2, method: 'llm' }, '🤖 CORPUS_SELECTION: Attempting LLM classification');
    }
    
    try {
      const corpusFromLLM = await this.classifyCorpusWithLLM(q, log);
      if (corpusFromLLM) {
        if (log?.debug) {
          log.debug({ 
            step: 2, 
            method: 'llm', 
            corpus: corpusFromLLM 
          }, '✅ CORPUS_SELECTION: LLM classification succeeded');
        }
        return corpusFromLLM;
      }
    } catch (error) {
      if (log?.debug) {
        log.debug({ error: String(error) }, '❌ CORPUS_SELECTION: LLM classification failed');
      }
    }

    // STEP 3: Fall back to rule-based heuristics
    if (log?.debug) {
      log.debug({ step: 3, method: 'rules' }, '🤖 CORPUS_SELECTION: Falling back to rule-based heuristics');
    }
    
    return this.classifyCorpusWithRules(q);
  }

  private classifyCorpusFromEntities(entities: Array<{ entity_group: string; score: number; text: string }>): 'airlines' | 'hotels' | 'visas' | null {
    const entityText = entities.map(e => e.text.toLowerCase()).join(' ');
    
    // Look for airline entities
    if (/(delta|united|american|southwest|jetblue|alaska|spirit|frontier)/.test(entityText)) {
      return 'airlines';
    }
    
    // Look for hotel entities
    if (/(marriott|hilton|hyatt|sheraton|westin|courtyard)/.test(entityText)) {
      return 'hotels';
    }
    
    return null;
  }

  private async classifyCorpusWithLLM(question: string, log?: pino.Logger): Promise<'airlines' | 'hotels' | 'visas' | null> {
    const tpl = await getPrompt('policy_classifier');
    const prompt = tpl.replace('{question}', question);

    try {
      const response = await callLLM(prompt, { log });
      const corpus = response.trim().toLowerCase();
      
      if (['airlines', 'hotels', 'visas'].includes(corpus)) {
        return corpus as 'airlines' | 'hotels' | 'visas';
      }
    } catch (error) {
      // LLM failed, will fall back to rules
    }
    
    return null;
  }

  private classifyCorpusWithRules(q: string): 'airlines' | 'hotels' | 'visas' {
    const s = q.toLowerCase();
    
    // Visa/passport patterns
    if (/(visa|passport|esta|entry|immigration|schengen|evisa)/.test(s)) {
      return 'visas';
    }
    
    // Airlines patterns (check first, more specific)
    if (/(airline|flight|delta|united|american|southwest|jetblue|alaska|spirit|frontier|baggage|carry.?on|checked.?bag|seat|boarding|miles|frequent.?flyer)/.test(s)) {
      return 'airlines';
    }
    
    // Hotel patterns (more specific, avoid generic terms)
    if (/(hotel|marriott|hilton|hyatt|sheraton|westin|courtyard|residence.?inn|check.?in|late.?checkout|room|suite|resort|accommodation)/.test(s)) {
      return 'hotels';
    }
    
    // Default to airlines for remaining policies
    return 'airlines';
  }

  private async assessInformationQuality(
    question: string,
    summary: string,
    citations: Array<{ title?: string; snippet?: string; score?: number }>,
    avgScore: number,
    log?: pino.Logger
  ): Promise<{ needsWebSearch: boolean; reason: string }> {
    try {
      const tpl = await getPrompt('policy_quality_assessor');
      const citationsText = citations.map((c, i) => 
        `[${i + 1}] ${c.title || 'Policy Document'} (Score: ${c.score?.toFixed(2) || 'N/A'})\n${c.snippet || 'No snippet'}`
      ).join('\n\n');
      
      const prompt = tpl
        .replace('{question}', question)
        .replace('{summary}', summary)
        .replace('{citations}', citationsText)
        .replace('{avgScore}', avgScore.toFixed(3));

      const response = await callLLM(prompt, { responseFormat: 'json', log });
      const assessment = JSON.parse(response.trim());
      
      return {
        needsWebSearch: assessment.recommendWebSearch || assessment.assessment === 'INSUFFICIENT',
        reason: assessment.reason || 'Quality assessment completed'
      };
    } catch (error) {
      if (log?.warn) {
        log.warn({ error: String(error) }, 'Quality assessment failed, using fallback logic');
      }
      
      // Fallback logic
      const hasInsufficientInfo = /I do not have enough information|insufficient information|cannot answer|no information available/i.test(summary);
      const lowQualityScores = avgScore < 0.5;
      
      return {
        needsWebSearch: hasInsufficientInfo || lowQualityScores,
        reason: hasInsufficientInfo ? 'Vectara reported insufficient information' : 
                lowQualityScores ? 'Low quality citations (FCS < 0.5)' : 
                'Information appears sufficient'
      };
    }
  }

  private composeFromHits(hits: Array<{ title?: string; snippet?: string }>): string {
    const lines = hits
      .filter(Boolean)
      .slice(0, 3)
      .map(h => `• ${h.title ?? 'Policy'} — ${String(h.snippet ?? '').slice(0, 160)}...`);
    
    return lines.length 
      ? `From policy sources:\n${lines.join('\n')}` 
      : 'No policy summary available.';
  }

  private async tryBrowserMode(
    question: string,
    citations: Array<{ url?: string; title?: string; snippet?: string }>,
    threadId?: string,
    log?: pino.Logger
  ): Promise<Array<{ url: string; quote: string; confidence: number; imgPath?: string }>> {
    try {
      const { extractPolicyClause } = await import('../tools/policy_browser.js');
      const { savePolicyReceipt } = await import('./policy_receipts.js');
      const { searchTravelInfo } = await import('../tools/search.js');
      
      // Extract clause type from question
      const clauseType = this.inferClauseType(question);
      const receipts: Array<{ url: string; quote: string; confidence: number; imgPath?: string }> = [];
      
      // Get URLs from citations or search for official policy pages
      let urlsToTry = citations.filter(c => c.url).map(c => c.url!);
      
      // If no URLs from citations, use web search to find official policy pages
      if (urlsToTry.length === 0) {
        log?.debug({ question }, 'No citation URLs, searching for official policy pages');
        
        // Create a search query for official policy pages
        const policySearchQuery = `${question} official site policy`;
        const searchResults = await searchTravelInfo(policySearchQuery, { maxResults: 3 });
        
        if (searchResults.ok && searchResults.results.length > 0) {
          urlsToTry = searchResults.results
            .filter(r => r.url && this.isOfficialPolicyUrl(r.url))
            .map(r => r.url!)
            .slice(0, 2);
          
          log?.debug({ urlsFound: urlsToTry.length, urls: urlsToTry }, 'Found policy URLs via search');
        }
      }
      
      // Try browser extraction on URLs
      for (const url of urlsToTry.slice(0, 2)) { // Limit to 2 URLs for performance
        try {
          log?.debug({ url, clauseType }, 'Attempting browser extraction');
          
          const receipt = await extractPolicyClause({
            url,
            clause: clauseType,
            timeoutMs: 8000
          });
          
          if (receipt.confidence >= 0.6) {
            receipts.push({
              url: receipt.url,
              quote: receipt.quote,
              confidence: receipt.confidence,
              imgPath: receipt.imgPath
            });
            
            if (threadId) {
              savePolicyReceipt(threadId, receipt);
            }
            
            log?.debug({ url, confidence: receipt.confidence }, 'Browser extraction successful');
          } else {
            log?.debug({ url, confidence: receipt.confidence }, 'Browser extraction low confidence');
          }
        } catch (error) {
          log?.debug({ url, error: String(error) }, 'Browser extraction failed for URL');
        }
      }
      
      return receipts;
    } catch (error) {
      log?.warn({ error: String(error) }, 'Browser mode initialization failed');
      return [];
    }
  }

  private isOfficialPolicyUrl(url: string): boolean {
    // Check if URL looks like an official policy page (not hardcoded domains)
    const u = url.toLowerCase();
    return (
      (u.includes('baggage') || u.includes('policy') || u.includes('terms')) &&
      !u.includes('blog') &&
      !u.includes('forum') &&
      !u.includes('reddit') &&
      !u.includes('wikipedia')
    );
  }

  private inferClauseType(question: string): 'baggage' | 'refund' | 'change' | 'visa' {
    const q = question.toLowerCase();
    if (/baggage|bag|luggage|carry.?on|checked/i.test(q)) return 'baggage';
    if (/refund|cancel|money.?back|reimburs/i.test(q)) return 'refund';
    if (/change|modify|reschedul|reboo/i.test(q)) return 'change';
    if (/visa|passport|entry|immigration/i.test(q)) return 'visa';
    return 'baggage'; // Default
  }
}
