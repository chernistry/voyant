# Blend Optimization: AI-First Single Planner Implementation

## Overview

This optimization transforms the blend system from multiple scattered LLM calls to a single AI-first planner that drives all decisions, while using deterministic composition for structured data.

## Key Changes

### 1. Single Planner LLM (`blend.planner.ts`)

Replaces multiple helper functions with one structured decision maker:
- **Removed**: `decideShouldSearch`, `detectQueryType`, multiple `classifyContentLLM` calls
- **Added**: `planBlend()` function that returns structured JSON with all routing decisions

```typescript
type BlendPlan = {
  explicit_search: boolean;
  unrelated: boolean;
  system_question: boolean;
  mixed_languages: boolean;
  query_facets: { wants_restaurants: boolean; wants_budget: boolean; wants_flights: boolean; };
  needs_web: boolean;
  needs_weather: boolean;
  needs_attractions: boolean;
  needs_country_facts: boolean;
  style: 'bullet'|'short'|'narrative';
  summarize_web_with_llm: boolean;
  missing_slots: string[];
  safety: { disallowed_topic: boolean; reason: string };
};
```

### 2. Deterministic Composers (`composers.ts`)

For structured data (weather, packing, attractions), skip LLM generation entirely:

```typescript
// Weather: 0 LLM calls after facts retrieval
composeWeatherReply(city, when, summary, source)

// Packing: 0 LLM calls after facts retrieval  
composePackingReply(city, when, summary, items, source)

// Attractions: 0 LLM calls for OpenTripMap results
composeAttractionsReply(city, attractions, source)
```

### 3. Batched LLM Generation

For complex cases requiring narrative (destinations), use single round-trip:

```typescript
const [cotAnalysis, rawReply] = await callLLMBatch([cotPrompt, finalPrompt], { log });
```

### 4. Smart Web Summarization (`searchSummarizer.ts`)

- Deterministic bullets for ≤2 short results
- LLM summarization only for ≥3 diverse results with substantial text
- Controlled by planner's `summarize_web_with_llm` flag

### 5. Prompt Memoization

Added caching to `getPrompt()` to eliminate repeated file system reads.

## Performance Impact

### LLM Calls Per Turn (Before → After)

| Intent | Before | After | Reduction |
|--------|--------|-------|-----------|
| Weather | 3-4 calls | **1 call** (planner only) | 67-75% |
| Packing | 3-4 calls | **1 call** (planner only) | 67-75% |
| Attractions | 3-4 calls | **1 call** (planner only) | 67-75% |
| Destinations | 4-5 calls | **2 calls** (planner + batch) | 50-60% |
| Web (trivial) | 3-4 calls | **1 call** (planner only) | 67-75% |
| Web (complex) | 4-5 calls | **2 calls** (planner + summarizer) | 50-60% |
| Unknown intent | 2-4 calls | **1 call** (planner only) | 50-75% |

### Key Optimizations

1. **Eliminated repeated classification**: Single planner replaces 3-4 separate classification calls
2. **Deterministic fast paths**: Weather/packing/attractions bypass LLM generation entirely
3. **Batched generation**: CoT + final answer in one round-trip when narrative is needed
4. **Smart web handling**: Deterministic bullets for simple results, LLM only for complex summaries

## Behavior Preservation

- **Factual accuracy**: Deterministic composers preserve exact temperatures, sources, and POI names
- **Citation handling**: Maintains proper source attribution and validation
- **Error handling**: Preserves unknown city detection and graceful fallbacks
- **Receipts system**: Facts storage and /why command verification unchanged
- **Mixed language detection**: Handled by planner with appropriate warnings

## Testing

Added comprehensive test coverage:
- `blend.planner.test.ts`: Validates planner decision logic
- `composers.test.ts`: Ensures deterministic output formatting

## Files Modified

### Core Changes
- `src/core/blend.ts`: Main optimization implementation
- `src/core/blend.planner.ts`: New single planner module
- `src/core/composers.ts`: New deterministic composers
- `src/core/searchSummarizer.ts`: Extracted and optimized web summarization
- `src/core/prompts.ts`: Added memoization and blend_planner prompt

### New Prompts
- `src/prompts/blend_planner.md`: Structured JSON planner prompt

### Tests
- `tests/unit/blend/blend.planner.test.ts`: Planner functionality tests
- `tests/unit/blend/composers.test.ts`: Deterministic composer tests

## Acceptance Criteria ✅

- **LLM efficiency**: Weather/Packing/Attractions use ≤1 LLM call per turn
- **No repeated classification**: Single planner eliminates scattered `classifyContentLLM` calls  
- **Behavior parity**: E2E functionality preserved, numerical facts unchanged
- **Deterministic facts**: Temperatures, sources, and POI names preserved exactly
- **Batched narrative**: Complex cases use single round-trip for CoT + final generation
- **Smart web handling**: Trivial results get deterministic bullets, complex get LLM summary

## Impact

This optimization significantly reduces LLM usage while maintaining response quality and accuracy. The AI-first approach uses one model to orchestrate the entire blend process, but stays lean by avoiding unnecessary generation for structured data.
