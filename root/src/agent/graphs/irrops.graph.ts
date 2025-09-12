import { StateGraph, END, Annotation } from '@langchain/langgraph';
import type { PNR, DisruptionEvent, IrropsOption } from '../../schemas/irrops.js';

const IrropsState = Annotation.Root({
  message: Annotation<string>,
  pnr: Annotation<PNR>,
  disruption: Annotation<DisruptionEvent>,
  options: Annotation<IrropsOption[]>,
  error: Annotation<string>,
  confidence: Annotation<number>
});

/**
 * Classify disruption type and severity from user message
 */
async function classifyDisruption(state: typeof IrropsState.State) {
  const { message } = state;
  
  // Simple classification logic - in production would use NLP/LLM
  let type: DisruptionEvent['type'] = 'user_request';
  let severity: DisruptionEvent['severity'] = 'medium';
  let confidence = 0.7;
  
  if (message.toLowerCase().includes('cancel')) {
    type = 'cancellation';
    severity = 'high';
    confidence = 0.9;
  } else if (message.toLowerCase().includes('delay')) {
    type = 'delay';
    severity = 'medium';
    confidence = 0.85;
  } else if (message.toLowerCase().includes('equipment')) {
    type = 'equipment_change';
    severity = 'low';
    confidence = 0.8;
  }
  
  const disruption: DisruptionEvent = {
    type,
    affectedSegments: [0], // Assume first segment affected
    timestamp: new Date().toISOString(),
    reason: message,
    severity
  };
  
  return { disruption, confidence };
}

/**
 * Start Temporal workflow for IRROPS processing
 */
async function startTemporalWorkflow(state: typeof IrropsState.State) {
  const { pnr, disruption } = state;
  
  if (!pnr || !disruption) {
    return { error: 'Missing PNR or disruption data' };
  }
  
  try {
    // In production, would start actual Temporal workflow
    // For now, use direct processing
    const { processIrrops } = await import('../../core/irrops_engine.js');
    const options = await processIrrops(pnr, disruption);
    
    return { options };
  } catch (error) {
    return { error: `Temporal workflow failed: ${error}` };
  }
}

/**
 * Handle workflow completion and format response
 */
async function handleCompletion(state: typeof IrropsState.State) {
  const { options, error } = state;
  
  if (error) {
    return { 
      error: 'Failed to process IRROPS request. Please contact your airline directly.' 
    };
  }
  
  if (!options || options.length === 0) {
    return { 
      error: 'No suitable rebooking options found. Please try different preferences.' 
    };
  }
  
  return { options };
}

/**
 * Route based on classification confidence
 */
function routeClassification(state: typeof IrropsState.State): string {
  const { confidence = 0 } = state;
  
  if (confidence >= 0.8) {
    return 'temporal_start';
  } else if (confidence >= 0.6) {
    return 'temporal_start'; // Still proceed but with lower confidence
  } else {
    return 'completion'; // Skip to completion with error
  }
}

/**
 * Route based on workflow result
 */
function routeWorkflow(state: typeof IrropsState.State): string {
  return 'completion';
}

// Create the IRROPS subgraph
export const irropsGraph = new StateGraph(IrropsState)
  .addNode('classify', classifyDisruption)
  .addNode('temporal_start', startTemporalWorkflow)
  .addNode('completion', handleCompletion)
  .addEdge('__start__', 'classify')
  .addConditionalEdges('classify', routeClassification)
  .addConditionalEdges('temporal_start', routeWorkflow)
  .addEdge('completion', END)
  .compile();

export type { IrropsState };
