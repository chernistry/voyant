import type pino from 'pino';
import { VectaraClient } from '../tools/vectara.js';
import { VECTARA } from '../config/vectara.js';
import { callLLM } from './llm.js';
import { extractEntities } from './ner.js';
import { getPrompt } from './prompts.js';

export type PolicyAnswer = { 
  answer: string; 
  citations: Array<{ url?: string; title?: string; snippet?: string; score?: number }>; 
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
    log?: pino.Logger
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
        avgScore: citations.length > 0 ? (citations.reduce((sum, c) => sum + (c.score || 0), 0) / citations.length).toFixed(3) : 0
      }, '✅ PolicyAgent: Retrieved policy answer with FCS filtering');
    }

    return { answer, citations };
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

  private composeFromHits(hits: Array<{ title?: string; snippet?: string }>): string {
    const lines = hits
      .filter(Boolean)
      .slice(0, 3)
      .map(h => `• ${h.title ?? 'Policy'} — ${String(h.snippet ?? '').slice(0, 160)}...`);
    
    return lines.length 
      ? `From policy sources:\n${lines.join('\n')}` 
      : 'No policy summary available.';
  }
}
