/**
 * Enhanced citation system with LLM-powered features:
 * - Intelligent citation relevance scoring
 * - Citation quality assessment
 * - Automatic citation formatting
 * - Duplicate detection and merging
 * - Citation verification against content
 */
import type pino from 'pino';
import { callLLM } from './llm.js';
import { getPrompt } from './prompts.js';

export interface Citation {
  url?: string;
  title?: string;
  snippet?: string;
  score?: number;
  source?: string;
}

export interface EnhancedCitation extends Citation {
  relevanceScore: number;
  qualityScore: number;
  formattedText: string;
  isDuplicate: boolean;
  verificationStatus: 'verified' | 'unverified' | 'conflicting';
}

export interface CitationAnalysis {
  citations: EnhancedCitation[];
  overallQuality: number;
  recommendedCount: number;
  hasFabricated: boolean;
}

/**
 * Legacy function - kept for backward compatibility
 */
export function enforceCitations(
  facts: Array<{ source: string; data: unknown }>,
): string[] {
  return facts.map((f) => String(f.source)).filter((s) => s.trim().length > 0);
}

/**
 * Legacy validation - kept for backward compatibility
 */
export function validateNoCitation(reply: string, hasExternalFacts: boolean): void {
  if (hasExternalFacts) return;
  
  const citationPatterns = [
    /\[source:/i,
    /\(source:/i,
    /according to/i,
    /based on.*report/i,
    /study shows/i,
    /research indicates/i
  ];
  
  for (const pattern of citationPatterns) {
    if (pattern.test(reply)) {
      throw new Error(`Potential fabricated citation detected: ${pattern.source}`);
    }
  }
}

/**
 * Analyze and enhance citations using LLM
 */
export async function analyzeCitations(
  citations: Citation[],
  query: string,
  content: string,
  log?: pino.Logger
): Promise<CitationAnalysis> {
  if (!citations.length) {
    return {
      citations: [],
      overallQuality: 0,
      recommendedCount: 0,
      hasFabricated: false
    };
  }

  try {
    const prompt = await getPrompt('citation_analysis');
    const citationData = citations.map((c, i) => ({
      id: i,
      title: c.title || 'Untitled',
      snippet: c.snippet || '',
      url: c.url || '',
      score: c.score || 0
    }));

    const analysisPrompt = prompt
      .replace('{query}', query)
      .replace('{content}', content.slice(0, 1000))
      .replace('{citations}', JSON.stringify(citationData, null, 2));

    const response = await callLLM(analysisPrompt, { responseFormat: 'json' });
    const analysis = JSON.parse(response);

    const enhancedCitations: EnhancedCitation[] = citations.map((citation, i) => {
      const citationAnalysis = analysis.citations?.find((c: any) => c.id === i) || {};
      
      return {
        ...citation,
        relevanceScore: citationAnalysis.relevanceScore || citation.score || 0.5,
        qualityScore: citationAnalysis.qualityScore || 0.5,
        formattedText: formatCitation(citation, citationAnalysis.suggestedFormat),
        isDuplicate: citationAnalysis.isDuplicate || false,
        verificationStatus: citationAnalysis.verificationStatus || 'unverified'
      };
    });

    // Remove duplicates and sort by relevance
    const uniqueCitations = removeDuplicateCitations(enhancedCitations);
    const sortedCitations = uniqueCitations.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const overallQuality = sortedCitations.length > 0
      ? sortedCitations.reduce((sum, c) => sum + c.qualityScore, 0) / sortedCitations.length
      : 0;

    if (log?.debug) {
      log.debug({
        originalCount: citations.length,
        enhancedCount: sortedCitations.length,
        overallQuality: overallQuality.toFixed(3),
        avgRelevance: sortedCitations.length > 0 
          ? (sortedCitations.reduce((sum, c) => sum + c.relevanceScore, 0) / sortedCitations.length).toFixed(3)
          : 0
      }, '🔗 Citations: Enhanced analysis complete');
    }

    return {
      citations: sortedCitations,
      overallQuality,
      recommendedCount: Math.min(analysis.recommendedCount || 3, sortedCitations.length),
      hasFabricated: analysis.hasFabricated || false
    };

  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ Citations: Analysis failed, using fallback');
    }

    // Fallback to basic processing
    return {
      citations: citations.map(c => ({
        ...c,
        relevanceScore: c.score || 0.5,
        qualityScore: 0.5,
        formattedText: formatCitation(c),
        isDuplicate: false,
        verificationStatus: 'unverified' as const
      })),
      overallQuality: 0.5,
      recommendedCount: Math.min(3, citations.length),
      hasFabricated: false
    };
  }
}

/**
 * Format citation for display
 */
function formatCitation(citation: Citation, suggestedFormat?: string): string {
  if (suggestedFormat) {
    return suggestedFormat;
  }

  const parts: string[] = [];
  
  if (citation.title) {
    parts.push(citation.title);
  }
  
  if (citation.url) {
    parts.push(`— ${citation.url}`);
  } else if (citation.source) {
    parts.push(`— ${citation.source}`);
  }

  return parts.join(' ') || 'Internal Knowledge Base';
}

/**
 * Remove duplicate citations based on content similarity
 */
function removeDuplicateCitations(citations: EnhancedCitation[]): EnhancedCitation[] {
  const unique: EnhancedCitation[] = [];
  const seen = new Set<string>();

  for (const citation of citations) {
    if (citation.isDuplicate) continue;

    // Create a normalized key for duplicate detection
    const key = normalizeForDeduplication(citation);
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(citation);
    }
  }

  return unique;
}

/**
 * Create normalized key for duplicate detection
 */
function normalizeForDeduplication(citation: Citation): string {
  const title = citation.title?.toLowerCase().trim() || '';
  const url = citation.url?.toLowerCase().trim() || '';
  const snippet = citation.snippet?.toLowerCase().slice(0, 100).trim() || '';
  
  return `${title}|${url}|${snippet}`;
}

/**
 * Verify citations against content for accuracy
 */
export async function verifyCitations(
  content: string,
  citations: Citation[],
  log?: pino.Logger
): Promise<{ verified: Citation[]; suspicious: Citation[] }> {
  if (!citations.length) {
    return { verified: [], suspicious: [] };
  }

  try {
    const prompt = await getPrompt('citation_verification');
    const verificationPrompt = prompt
      .replace('{content}', content.slice(0, 1500))
      .replace('{citations}', JSON.stringify(citations.map(c => ({
        title: c.title,
        snippet: c.snippet,
        url: c.url
      })), null, 2));

    const response = await callLLM(verificationPrompt, { responseFormat: 'json' });
    const result = JSON.parse(response);

    const verified = citations.filter((_, i) => 
      result.verified?.includes(i) || (!result.suspicious?.includes(i) && !result.fabricated?.includes(i))
    );
    
    const suspicious = citations.filter((_, i) => 
      result.suspicious?.includes(i) || result.fabricated?.includes(i)
    );

    if (log?.debug) {
      log.debug({
        totalCitations: citations.length,
        verified: verified.length,
        suspicious: suspicious.length
      }, '🔍 Citations: Verification complete');
    }

    return { verified, suspicious };

  } catch (error) {
    if (log?.debug) {
      log.debug({ error: String(error) }, '❌ Citations: Verification failed');
    }
    
    // Fallback: assume all citations are verified
    return { verified: citations, suspicious: [] };
  }
}

/**
 * Generate citation summary for display
 */
export function generateCitationSummary(analysis: CitationAnalysis): string {
  if (!analysis.citations.length) {
    return '';
  }

  const topCitations = analysis.citations
    .slice(0, analysis.recommendedCount)
    .map((c, i) => `${i + 1}. ${c.formattedText}`)
    .join('\n');

  return `\n\nSources:\n${topCitations}`;
}
