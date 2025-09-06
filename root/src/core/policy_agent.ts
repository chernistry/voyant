import type pino from 'pino';
import { VectaraClient } from '../tools/vectara.js';
import { VECTARA } from '../config/vectara.js';

export type PolicyAnswer = { 
  answer: string; 
  citations: Array<{ url?: string; title?: string; snippet?: string }>; 
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

    const corpus = this.pickCorpus(question, corpusHint);
    
    if (log?.debug) {
      log.debug({ question, corpus, corpusHint }, '🔍 PolicyAgent: Querying Vectara');
    }

    const res = await this.vectara.query(question, { corpus, maxResults: 6 });

    const citations = (res.citations.length ? res.citations : res.hits)
      .slice(0, 5)
      .map(c => ({
        url: c.url,
        title: c.title,
        snippet: ('text' in c ? c.text : ('snippet' in c ? c.snippet : '')) || '',
      }));

    const answer = res.summary || this.composeFromHits(citations);

    if (log?.debug) {
      log.debug({ 
        citationsCount: citations.length, 
        hasSummary: !!res.summary 
      }, '✅ PolicyAgent: Retrieved policy answer');
    }

    return { answer, citations };
  }

  private pickCorpus(
    q: string, 
    hint?: 'airlines' | 'hotels' | 'visas'
  ): 'airlines' | 'hotels' | 'visas' {
    if (hint) return hint;
    
    const s = q.toLowerCase();
    
    // Visa/passport patterns
    if (/(visa|passport|esta|entry|immigration|schengen|evisa)/.test(s)) {
      return 'visas';
    }
    
    // Hotel patterns  
    if (/(hotel|cancellation|reservation|booking|check.?in|late.?checkout|marriott|hilton|hyatt)/.test(s)) {
      return 'hotels';
    }
    
    // Default to airlines for baggage, flight policies
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
