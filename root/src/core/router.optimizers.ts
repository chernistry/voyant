// Router optimization utilities - regex guards and heuristics

export const RE = {
  sys: /\b(help|what can you do|who (are|r) you|how do you work)\b/i,
  policy: /\b(visa|passport|entry (req|requirement)s?|immigration|customs|baggage policy|fare rules?)\b/i,
  explicitSearch: /^(search|find|look ?up|google)\b/i,
  flightDirect: /\b(from|ex)\s+[\w\s.'-]+?\s+(to|→|-?>)\s+[\w\s.'-]+/i,
  iataPair: /\b([A-Z]{3})\s*(to|→|-?>)\s*([A-Z]{3})\b/,
  dateish: /\b(today|tomorrow|this (week|weekend|month)|next (week|month)|\d{1,2}[-/]\d{1,2}([-/]\d{2,4})?)\b/i,
  flights: /\b(flight|flights|book|booking|airline|fare|one way|round ?trip)\b/i,
  weather: /\b(weather|temperature|forecast|precip)\b/i,
  budget: /[$€£]\s?\d+|\bunder\s?\$?\d+/i,
};

export function isDirectFlightHeuristic(msg: string): {isDirect: boolean; reason: string} {
  const m = msg.trim();
  const direct = (RE.flightDirect.test(m) || RE.iataPair.test(m)) && RE.dateish.test(m);
  return { isDirect: direct, reason: direct ? 'od+date' : 'missing_od_or_date' };
}

export function cheapComplexity(msg: string): {complex: boolean; reason: string} {
  const hasBudget = RE.budget.test(msg);
  const locCount = (msg.match(/\b(in|at|from|to)\s+[\w .'-]{2,}/gi) || []).length;
  const dateHits = RE.dateish.test(msg);
  const longish = msg.length > 160;
  const multi = (locCount >= 2) || (hasBudget && (dateHits || locCount > 0));
  return { complex: longish || multi, reason: `budget=${hasBudget}, locs=${locCount}, date=${dateHits}` };
}
