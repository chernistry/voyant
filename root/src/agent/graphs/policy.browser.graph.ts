import { StateGraph, END, Annotation } from '@langchain/langgraph';
import { extractPolicyClause } from '../../tools/policy_browser.js';
import { savePolicyReceipt } from '../../core/policy_receipts.js';
import type { PolicyReceipt, ClauseTypeT } from '../../schemas/policy.js';

const PolicyBrowserState = Annotation.Root({
  url: Annotation<string>,
  clause: Annotation<ClauseTypeT>,
  threadId: Annotation<string>,
  receipt: Annotation<PolicyReceipt>,
  error: Annotation<string>,
  confidence: Annotation<number>
});

/**
 * Route policy extraction request
 */
async function routeExtraction(state: typeof PolicyBrowserState.State) {
  const { url, clause } = state;
  
  if (!url || !clause) {
    return { error: 'Missing required parameters: url and clause' };
  }
  
  try {
    new URL(url); // Validate URL format
  } catch {
    return { error: 'Invalid URL format' };
  }
  
  return state;
}

/**
 * Extract policy clause using Crawlee
 */
async function extractClause(state: typeof PolicyBrowserState.State) {
  const { url, clause, threadId } = state;
  
  try {
    const receipt = await extractPolicyClause({
      url,
      clause,
      timeoutMs: 15000
    });
    
    // Save receipt to thread memory
    if (threadId) {
      savePolicyReceipt(threadId, receipt);
    }
    
    return {
      receipt,
      confidence: receipt.confidence,
      error: undefined
    };
  } catch (error) {
    return {
      error: `Policy extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      confidence: 0
    };
  }
}

/**
 * Guard against low confidence results
 */
async function confidenceGuard(state: typeof PolicyBrowserState.State) {
  const { confidence, receipt } = state;
  
  if (confidence < 0.6) {
    return {
      error: `Low confidence extraction (${confidence?.toFixed(2)}). Consider manual review.`,
      receipt: undefined
    };
  }
  
  return state;
}

// Build the graph
export const policy_browser_graph = new StateGraph(PolicyBrowserState)
  .addNode('route', routeExtraction)
  .addNode('extract', extractClause)
  .addNode('guard', confidenceGuard)
  .addEdge('route', 'extract')
  .addEdge('extract', 'guard')
  .addEdge('guard', END)
  .setEntryPoint('route')
  .compile();
