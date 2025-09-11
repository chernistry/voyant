import { getPrompt } from './prompts.js';
import { callLLM } from './llm.js';
import { getSearchCitation } from '../tools/search.js';

export async function summarizeSearch(
  results: Array<{ title: string; url: string; description: string }>,
  query: string,
  useLLM: boolean,
  ctx: { log: any },
): Promise<{ reply: string; citations: string[] }> {
  if (!useLLM || results.length <= 2) {
    return formatSearchResultsDeterministic(results);
  }

  try {
    const promptTemplate = await getPrompt('search_summarize');
    const topResults = results.slice(0, 7);
    const formattedResults = topResults.map((result, index) => ({
      id: index + 1,
      title: result.title.replace(/<[^>]*>/g, ''),
      url: result.url,
      description: result.description.replace(/<[^>]*>/g, '').slice(0, 200)
    }));
    
    const prompt = promptTemplate
      .replace('{query}', query)
      .replace('{results}', JSON.stringify(formattedResults, null, 2));
    
    const response = await callLLM(prompt, { log: ctx.log });
    let sanitized = response
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    
    if (sanitized.length > 2000) {
      const sentences = sanitized.split(/[.!?]+/);
      let truncated = '';
      for (const sentence of sentences) {
        if ((truncated + sentence).length > 1900) break;
        truncated += sentence + '.';
      }
      sanitized = truncated;
    }
    
    const hasLinks = /https?:\/\//i.test(sanitized) || /Sources:/i.test(sanitized);
    let finalText = sanitized;
    if (!hasLinks) {
      const sourcesBlock = ['Sources:', ...formattedResults.slice(0, 5).map(r => `${r.id}. ${r.title} - ${r.url}`)].join('\n');
      finalText = `${sanitized}\n\n${sourcesBlock}`;
    }
    return {
      reply: finalText,
      citations: [getSearchCitation()]
    };
  } catch {
    return formatSearchResultsDeterministic(results);
  }
}

function formatSearchResultsDeterministic(
  results: Array<{ title: string; url: string; description: string }>
): { reply: string; citations: string[] } {
  const topResults = results.slice(0, 3);
  const formattedResults = topResults.map(result => {
    const cleanTitle = result.title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '');
    const cleanDesc = result.description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '');
    const truncatedDesc = cleanDesc.slice(0, 100) + (cleanDesc.length > 100 ? '...' : '');
    return `• ${cleanTitle} - ${truncatedDesc}`;
  }).join('\n');
  
  return {
    reply: `Based on web search results:\n\n${formattedResults}\n\nSources: ${getSearchCitation()}`,
    citations: [getSearchCitation()]
  };
}
