# Failing Tests Summary

## Context Tests (mostly fixed)
- **Graph test timeout** - `follow-up context handling` times out at 15s
- **System identity question** - "Are you a real person?" gets travel date clarification instead of AI assistant identification
- **Destinations test** - One test asks clarifying question instead of providing destinations

## Multilingual Tests (partially fixed)
- **Russian query in transcript test** - Still asking for clarification instead of processing complete query
- **Spanish Barcelona query** - Attractions API fails with "no_pois", system correctly returns error message (expected behavior for API-only design)

## Edge Cases (mostly fixed)
- **Very long messages** - 1 test expects key extraction vs generic response
- **Japanese input** - Router doesn't handle Japanese characters properly in city extraction

## Root Causes
1. **Attractions API consistently failing** - Wikipedia/Brave Search fallback not working, returns "no_pois" for all cities
2. **System identity detection** - System questions not properly detected, treated as travel queries
3. **Japanese character handling** - Router city extraction fails for non-Latin scripts
4. **Test timeouts** - Some tests exceed 15-45s limits due to API call delays

## Status
- Most edge cases fixed (whitespace, long city names, mixed languages)
- Context preservation working correctly
- API-only design correctly prevents fabrication of information
- Citation validation working properly
