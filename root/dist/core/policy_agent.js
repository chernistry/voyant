import { VectaraClient } from '../tools/vectara.js';
import { VECTARA } from '../config/vectara.js';
import { callLLM } from './llm.js';
import { extractEntities } from './transformers-nlp.js';
/**
 * Policy agent that orchestrates Vectara retrieval and formats citations.
 */
export class PolicyAgent {
    vectara = new VectaraClient();
    async answer(question, corpusHint, threadId, log) {
        if (!VECTARA.ENABLED) {
            throw new Error('Vectara RAG is disabled');
        }
        const corpus = await this.pickCorpus(question, corpusHint, log);
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
        const answer = res.summary || await this.summarizeWithLLM(question, citations, log);
        if (log?.debug) {
            log.debug({
                citationsCount: citations.length,
                hasSummary: !!res.summary,
                usedLLMSummary: !res.summary && citations.length > 0
            }, '✅ PolicyAgent: Retrieved policy answer');
        }
        return { answer, citations };
    }
    async summarizeWithLLM(question, citations, log) {
        if (!citations.length) {
            return 'No policy summary available.';
        }
        const context = citations
            .filter(c => c.snippet?.trim())
            .map((c, i) => `[${i + 1}] ${c.title || 'Policy Document'}\n${c.snippet}`)
            .join('\n\n');
        const prompt = `Based on the following policy documents, provide a clear and concise answer to the user's question.

Question: ${question}

Policy Documents:
${context}

Instructions:
- Answer directly and concisely
- Use information only from the provided documents
- If the documents don't contain relevant information, say so
- Include specific details like timeframes, fees, or requirements when available
- Keep the response professional and helpful

Answer:`;
        try {
            const response = await callLLM(prompt, { log });
            return response.trim();
        }
        catch (error) {
            if (log?.warn) {
                log.warn({ error: String(error) }, 'LLM summarization failed, using fallback');
            }
            return this.composeFromHits(citations);
        }
    }
    async pickCorpus(q, hint, log) {
        if (hint)
            return hint;
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
        }
        catch (error) {
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
        }
        catch (error) {
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
    classifyCorpusFromEntities(entities) {
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
    async classifyCorpusWithLLM(question, log) {
        const prompt = `Classify this travel policy question into one of three categories:

Question: "${question}"

Categories:
- airlines: Flight policies, baggage, airline-specific rules, boarding, seats, miles
- hotels: Hotel policies, room bookings, check-in/out, hotel-specific rules  
- visas: Visa requirements, passport rules, immigration, entry requirements

Respond with only: airlines, hotels, or visas`;
        try {
            const response = await callLLM(prompt, { log });
            const corpus = response.trim().toLowerCase();
            if (['airlines', 'hotels', 'visas'].includes(corpus)) {
                return corpus;
            }
        }
        catch (error) {
            // LLM failed, will fall back to rules
        }
        return null;
    }
    classifyCorpusWithRules(q) {
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
    composeFromHits(hits) {
        const lines = hits
            .filter(Boolean)
            .slice(0, 3)
            .map(h => `• ${h.title ?? 'Policy'} — ${String(h.snippet ?? '').slice(0, 160)}...`);
        return lines.length
            ? `From policy sources:\n${lines.join('\n')}`
            : 'No policy summary available.';
    }
}
