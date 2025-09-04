import { routeIntent } from './router.js';
import { blendWithFacts } from './blend.js';
import { buildClarifyingQuestion } from './clarifier.js';
import { getThreadSlots, updateThreadSlots, setLastIntent, getLastIntent } from './slot_memory.js';
import type pino from 'pino';
import pinoLib from 'pino';

export type NodeCtx = { msg: string; threadId: string };
export type NodeOut =
  | { next: 'weather' | 'destinations' | 'packing' | 'attractions' | 'unknown'; slots?: Record<string, string> }
  | { done: true; reply: string; citations?: string[] };

export async function runGraphTurn(
  message: string,
  threadId: string,
  ctx: { log: pino.Logger },
): Promise<NodeOut> {
  // Check for budget queries - process as destination query with disclaimer
  const budgetPatterns = [
    /budget|cost|price|money|expensive|cheap|afford|spend|currency exchange|exchange rate/i
  ];
  
  const isBudgetQuery = budgetPatterns.some(pattern => pattern.test(message));
  let budgetDisclaimer = '';
  if (isBudgetQuery) {
    budgetDisclaimer = 'I can\'t help with budget planning or costs, but I can provide travel destination information. ';
  }

  const routeCtx: NodeCtx = { msg: message, threadId };
  const routeResult = await routeIntentNode(routeCtx, ctx);
  if ('done' in routeResult) {
    return routeResult;
  }
  // Handle follow-up responses: if intent is unknown but we have prior context, try to infer intent
  let intent = routeResult.next;
  const prior = getThreadSlots(threadId);
  const slots = { ...prior, ...(routeResult.slots || {}) };
  
  // If intent is unknown but we have context and new slots, infer intent from last interaction
  if (intent === 'unknown' && Object.keys(prior).length > 0 && Object.keys(routeResult.slots || {}).length > 0) {
    const lastIntent = getLastIntent(threadId);
    if (lastIntent && lastIntent !== 'unknown') {
      intent = lastIntent;
      if (ctx.log && typeof ctx.log.debug === 'function') {
        ctx.log.debug({ originalIntent: 'unknown', inferredIntent: intent, prior, newSlots: routeResult.slots }, 'intent_inference');
      }
    }
  }
  
  setLastIntent(threadId, intent);
  if (ctx.log && typeof ctx.log.debug === 'function') {
    ctx.log.debug({ prior, extracted: routeResult.slots, merged: slots, intent }, 'slot_merge');
  }
  
  const needsCity = intent === 'attractions' || intent === 'packing' || intent === 'destinations' || intent === 'weather';
  const hasCity = typeof slots.city === 'string' && slots.city.trim().length > 0;
  const hasWhen = (typeof slots.dates === 'string' && slots.dates.trim().length > 0)
    || (typeof slots.month === 'string' && slots.month.trim().length > 0);
  
  // Check if message has immediate time context that doesn't require date clarification
  const hasImmediateContext = /\b(today|now|currently|right now|what to wear)\b/i.test(message);
  const hasSpecialContext = /\b(kids?|children|family|business|work|summer|winter|spring|fall)\b/i.test(message);
  
  const missing: string[] = [];
  if (needsCity && !hasCity) missing.push('city');
  if (intent === 'destinations' && !hasWhen) missing.push('dates');
  if (intent === 'packing' && !hasWhen && !hasImmediateContext && !hasSpecialContext) missing.push('dates');
  // Weather queries do NOT require dates - they can provide current weather
  
  if (ctx.log && typeof ctx.log.debug === 'function') {
    ctx.log.debug({ 
      needsCity, hasCity, hasWhen, missing, 
      cityValue: slots.city, 
      datesValue: slots.dates, 
      monthValue: slots.month 
    }, 'missing_check');
  }
  
  if (missing.length > 0) {
    updateThreadSlots(threadId, slots as Record<string, string>, missing);
    const q = buildClarifyingQuestion(missing, slots as Record<string, string>);
    if (ctx.log && typeof ctx.log.debug === 'function') {
      ctx.log.debug({ missing, q }, 'clarifier');
    }
    return { done: true, reply: q };
  }
  // Persist merged slots once complete
  updateThreadSlots(threadId, slots as Record<string, string>, []);

  // Use merged slots for downstream nodes
  const mergedSlots = slots as Record<string, string>;

  switch (intent) {
    case 'destinations':
      return destinationsNode(routeCtx, mergedSlots, ctx, budgetDisclaimer);
    case 'weather':
      return weatherNode(routeCtx, mergedSlots, ctx);
    case 'packing':
      return packingNode(routeCtx, mergedSlots, ctx);
    case 'attractions':
      return attractionsNode(routeCtx, mergedSlots, ctx);
    case 'unknown':
      return unknownNode(routeCtx, ctx);
    default:
      return unknownNode(routeCtx, ctx);
  }
}

async function routeIntentNode(ctx: NodeCtx, logger?: { log: pino.Logger }): Promise<NodeOut> {
  const r = await routeIntent({ message: ctx.msg, threadId: ctx.threadId, logger });
  return { next: r.intent, slots: r.slots };
}

async function weatherNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'weather',
        needExternal: false,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}

async function destinationsNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
  disclaimer?: string,
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'destinations',
        needExternal: true,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  const finalReply = disclaimer ? disclaimer + reply : reply;
  return { done: true, reply: finalReply, citations };
}

async function packingNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'packing',
        needExternal: false,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}

async function attractionsNode(
  ctx: NodeCtx,
  slots?: Record<string, string>,
  logger?: { log: pino.Logger },
): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'attractions',
        needExternal: true,
        slots: slots || {},
        confidence: 0.7,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}

async function unknownNode(ctx: NodeCtx, logger?: { log: pino.Logger }): Promise<NodeOut> {
  const { reply, citations } = await blendWithFacts(
    {
      message: ctx.msg,
      route: {
        intent: 'unknown',
        needExternal: false,
        slots: {},
        confidence: 0.3,
      },
      threadId: ctx.threadId,
    },
    logger || { log: pinoLib({ level: 'silent' }) },
  );
  return { done: true, reply, citations };
}
