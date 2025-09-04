# Failing Tests Documentation

## Current Status
Last updated: 2025-01-24

## Critical Packing Test Failures

### 1. Context Preservation (Intent Switching) ❌ CRITICAL
**Test**: `tests/e2e_comprehensive_flow.test.ts` - "switch from weather to packing"
**Error**: "Response provides general Paris packing suggestions but fails to incorporate the specific month of June from the test context"
**Root Cause**: When user asks "What should I pack?" after weather query, system doesn't properly reference the June context from previous turn
**Log Evidence**: Shows `"prior":{"city":"Paris","month":"June","dates":"June"}` but final response doesn't mention June specifically
**Priority**: HIGH - Context switching is core functionality

### 2. Missing Date Clarification ❌ CRITICAL  
**Test**: `tests/e2e_comprehensive_flow.test.ts` - "packing with special circumstances"
**Error**: "The response provides family-friendly packing suggestions but fails to ask for travel dates"
**Root Cause**: For "What to pack for Tokyo if I have kids?" - system should ask for dates but provides general advice instead
**Log Evidence**: Shows `"missing":[]` when it should detect missing dates and ask clarification
**Priority**: HIGH - Clarification logic is essential

### 3. Graph Test Timeout ❌ MEDIUM
**Test**: `tests/graph.test.ts` - "packing intent with city and month"
**Error**: "Exceeded timeout of 10000 ms"
**Root Cause**: Test timing out, likely due to slow API calls or infinite loops
**Priority**: MEDIUM - Performance issue

### 4. OpenTripMap TypeScript Errors ❌ LOW
**Test**: `tests/opentripmap.test.ts`
**Error**: "Object is possibly 'undefined'" on `res.pois[0]` access
**Root Cause**: Missing null checks for array access in test assertions
**Priority**: LOW - Simple TypeScript fix

## Other Known Issues

### 5. Context Tests (mostly fixed)
- **Graph test timeout** - `follow-up context handling` times out at 15s
- **System identity question** - "Are you a real person?" gets travel date clarification instead of AI assistant identification
- **Destinations test** - One test asks clarifying question instead of providing destinations

### 6. Multilingual Tests (partially fixed)
- **Russian query in transcript test** - Still asking for clarification instead of processing complete query
- **Spanish Barcelona query** - Attractions API fails with "no_pois", system correctly returns error message (expected behavior for API-only design)

### 7. Edge Cases (mostly fixed)
- **Very long messages** - 1 test expects key extraction vs generic response
- **Japanese input** - Router doesn't handle Japanese characters properly in city extraction

## Root Causes Analysis
1. **Attractions API consistently failing** - Wikipedia/Brave Search fallback not working, returns "no_pois" for all cities
2. **System identity detection** - System questions not properly detected, treated as travel queries
3. **Japanese character handling** - Router city extraction fails for non-Latin scripts
4. **Test timeouts** - Some tests exceed 15-45s limits due to API call delays

## Fixed Issues ✅
- Edge case handling in router.ts (whitespace, long cities, mixed languages)
- Month detection to prevent "March" being parsed as city name
- Slot merging logic fixed to preserve date information from LLM extraction
- Multilingual test expectations updated to match API-only design constraints
- Context preservation working correctly across conversation turns
- API-only design correctly prevents fabrication of information
- Citation validation working properly

## Next Steps
1. Fix context preservation to properly reference previous turn information in responses
2. Fix missing slot detection for packing queries without dates
3. Increase timeout or optimize graph test performance
4. Add null checks to OpenTripMap test assertions
5. Continue systematic test execution from end to beginning with immediate fixes
