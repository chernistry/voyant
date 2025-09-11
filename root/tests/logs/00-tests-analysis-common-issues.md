# Common Test Issues Analysis

## Overview
Reviewed 13 e2e, integration, and unit logs. Current runs disable Transformers NER and
partially disable intent detection, forcing LLM-only extraction. The system must support
both LLM-only and Transformer-assisted modes.

## Common Failure Patterns

### 1. LLM-only entity and intent gaps
- Logs: 01-weather-packing, 02-attractions_variants, 03-intent_family_thread,
  04-input_variance_cot, 05-errors_api_failures,
  07-conflicting_abrupt_sensitive_multilang_metrics, 09-demo_authentic_conversation.
- Symptoms: `city_llm_failed`, empty slots, evaluator notes "no intent classification".
- Impact: Router loops, asks for missing data instead of answering.
- When Transformers are enabled, intent scores are high yet NER remains off, so slots
  still fail. Both modes need a clear cascade: Transformers→LLM→regex fallback.

### 2. External API misconfig and breaker trips
- Logs: 02-attractions_variants, 05-errors_api_failures, custom-suite.
- Symptoms: OpenTripMap 400, Open-Meteo 503, Tavily import errors; circuit breaker opens
  and generic fallbacks appear.
- Impact: Missing citations, low confidence answers, LLM evaluator failures.

### 3. Unstable test and build setup
- Logs: custom-suite, unit, integration, deep-research, flights-clarification.
- Symptoms: TypeScript type errors (`reason` missing), `.ts` import failures, Jest
  timeouts, lingering TCP handles.
- Impact: Suites abort before validating behavior.

## Root Causes
- Transformer stage disabled; LLM prompts and Zod schemas allow undefined fields, and no
  confidence thresholds trigger retries or user confirmation.
- External tools lack parameter validation and resilient mocks, causing breaker churn.
- Test harness omits strict tsconfig and afterAll cleanup.

## Top 3 Critical Problems and Solutions

1. **Harden entity and intent cascade**
   *Affected:* 01,02,03,04,05,07,09
   *Fix:* Reinstate Transformers NER/intent when available; when disabled, use tuned LLM
   prompts plus schema validation. Add confidence routing (≥0.90 act, ≥0.75 confirm,
   <0.60 fallback) and log extraction method.

2. **Guard external API layer**
   *Affected:* 02,05,custom-suite
   *Fix:* Validate query params, seed mocks, wrap calls with circuit breaker metrics and
   user-facing fallbacks.

3. **Stabilize test harness**
   *Affected:* custom, unit, integration, deep-research, flights-clarification
   *Fix:* Align tsconfig (`allowImportingTsExtensions` or drop `.ts`), include `reason`
   in types, and close servers in `afterAll`.

## Priority
1. Entity and intent accuracy.
2. Reliable external data sources.
3. Stable test environment.
