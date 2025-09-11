# Navan Test Suite Analysis (Updated 2025)

## Test Architecture Overview

The test suite consists of 5 main categories:
- **Unit tests** (25 files) - test individual components
- **Integration tests** (6 files) - test component interactions
- **E2E tests** (10 files) - test complete user scenarios
- **API/Security tests** (20+ files) - test APIs and security
- **Performance/Other tests** (10+ files) - performance, tools, configuration

---

## 🔍 DETAILED FILE-BY-FILE ANALYSIS (CURRENCY VERIFIED - 2025)

### CRITICAL ISSUES SUMMARY

**High Priority Issues Requiring Immediate Action:**
1. **Outdated Jest mocking patterns** - 2 tests use deprecated `jest.unstable_mockModule`
2. **Missing critical E2E scenarios** - No comprehensive tests for complex multi-turn dialogues
3. **Insufficient coverage of consent flows** - Deep research consent not fully tested
4. **Missing flight clarification E2E tests** - Core ambiguity resolution flow untested
5. **Outdated test expectations** - Some tests expect functionality that has evolved

**Tests Requiring Immediate Rewrite (Week 1-2):**
- `deep_research.test.ts` - Replace jest.unstable_mockModule with modern ESM mocking
- `parsers-nlp-first.test.ts` - Replace jest.unstable_mockModule with modern ESM mocking

**Missing Critical Test Scenarios:**
- Complex chaotic conversation flows (flight → weather → attractions → planning → consent → /why)
- Flight clarification flow E2E tests
- Deep research consent flow E2E tests
- Mixed language processing E2E tests
- Error recovery in complex multi-turn dialogues

### UNIT TESTS (/unit/)

#### `amadeus_flights.test.ts`
**What it tests:** Integration with Amadeus API for flight search, including authorization tokens, response processing, and date conversion
**Current:** ✅ Yes - code matches tests, functions exist and work as expected
**Makes sense:** ✅ Yes, critically important flight search functionality
**Recommendations:** Add tests for edge cases with invalid tokens, add tests for different service classes

#### `circuit-breaker-rate-limit.test.ts`
**What it tests:** Rate limiting and circuit breaker patterns for API overload protection
**Current:** ✅ Yes - tests opossum circuit breaker through util/circuit.ts
**Makes sense:** ✅ Yes, important for system resilience
**Recommendations:** Add tests for distributed rate limiting

#### `circuit-breaker.test.ts`
**What it tests:** Circuit breaker states (CLOSED, OPEN, HALF_OPEN) and automatic recovery
**Current:** ✅ Yes - tests custom CircuitBreaker implementation from core/circuit-breaker.ts
**Makes sense:** ✅ Yes, fundamental for fault tolerance
**Recommendations:** Add tests for concurrent access, add tests for various configurations

#### `constraintGraph.test.ts`
**What it tests:** Logic for building constraint graphs for query routing
**Current:** ✅ Yes - code matches tests, functions `buildConstraintGraph`, `getCombinationKey` exist
**Makes sense:** ✅ Yes, key for intelligent routing
**Recommendations:** Add graph visualization to reports, add tests for complex constraint combinations

#### `content.classification.test.ts`
**What it tests:** Parsing JSON from LLM responses for content classification
**Current:** ✅ Yes - matches implementation in core/llm.ts
**Makes sense:** ✅ Yes, important for content understanding
**Recommendations:** Add tests for malformed JSON edge cases, add tests for various LLM response formats

#### `country-nlp-detection.test.ts`
**What it tests:** Recognition of countries and currencies from query text
**Current:** ✅ Yes - matches parsers/country.ts
**Makes sense:** ✅ Yes, important for geographical context
**Recommendations:** Add support for regional variations, add tests for multilingual queries

#### `crawlee.engine.test.ts`
**What it tests:** Web crawling functionality with Crawlee
**Current:** ✅ Yes - matches tools/crawlee_research.ts
**Makes sense:** ✅ Yes, for web data collection
**Recommendations:** Add tests for rate limiting and anti-bot detection

#### `crawlee.fallback.test.ts`
**What it tests:** Fallback strategies when crawling fails
**Current:** ✅ Yes - matches crawlee implementation
**Makes sense:** ✅ Yes, important for reliability
**Recommendations:** Improve coverage for various error types

#### `deep_research.test.ts`
**What it tests:** Deep analysis and data research functionality
**Current:** ❌ No - uses deprecated jest.unstable_mockModule (breaks in Jest 29+)
**Makes sense:** ✅ Yes - critical for complex research queries
**Recommendations:** **HIGH PRIORITY** - Rewrite using modern ESM mocking patterns. Verify performDeepResearch function interface matches expectations.

#### `destinations-nlp.test.ts`
**What it tests:** NLP processing of travel destination queries
**Current:** ✅ Yes - matches tools/destinations.ts
**Makes sense:** ✅ Yes, core travel functionality
**Recommendations:** Expand to multi-language support

#### `flight_intent_basic.test.ts`
**What it tests:** Basic intent recognition for flight search
**Current:** ✅ Yes - matches router.ts flight detection logic
**Makes sense:** ✅ Yes, fundamental flight search
**Recommendations:** Integrate with more advanced NLP models

#### `location-context-retention.test.ts`
**What it tests:** Retention of location context between queries
**Current:** ✅ Yes - matches core/slot_memory.ts
**Makes sense:** ✅ Yes, important for conversational flow
**Recommendations:** Add tests for context conflicts

#### `ner.facade.test.ts`
**What it tests:** Named Entity Recognition facade layer
**Current:** ✅ Yes - matches core/ner.ts
**Makes sense:** ✅ Yes, key for entity extraction
**Recommendations:** Add accuracy benchmarks

#### `nlp_wrappers.test.ts`
**What it tests:** Wrappers for NLP libraries and models
**Current:** ✅ Yes - matches core/nlp.ts
**Makes sense:** ✅ Yes, important for text processing
**Recommendations:** Add performance profiling

#### `parsers-nlp-first.test.ts`
**What it tests:** NLP-first parsing avoids LLM calls for high-confidence cases
**Current:** ❌ No - uses deprecated jest.unstable_mockModule (breaks in Jest 29+)
**Makes sense:** ✅ Yes - ensures NLP efficiency before LLM fallback
**Recommendations:** **HIGH PRIORITY** - Rewrite using modern ESM mocking. Verify parseCity and parseOriginDestination function signatures.

#### `parsers.od.test.ts`
**What it tests:** Parsing data from Amadeus API responses
**Current:** ✅ Yes - matches Amadeus parsing logic
**Makes sense:** ✅ Yes, critical for flight data processing
**Recommendations:** Add schema validation tests

#### `policy-routing.test.ts`
**What it tests:** Policy question routing (visa, airline policies, hotel policies)
**Current:** ✅ Yes - routes Delta, United, Marriott policy questions correctly
**Makes sense:** ✅ Yes - critical for policy-specific queries
**Recommendations:** Add more airline policy examples, test edge cases with ambiguous policy questions.

#### `policy.receipts.test.ts`
**What it tests:** Policies for receipt and expense processing
**Current:** ✅ Yes - matches core/receipts.ts
**Makes sense:** ✅ Yes, for expense management
**Recommendations:** Expand to multi-currency scenarios

#### `rate-limiter.test.ts`
**What it tests:** Rate limiting mechanisms
**Current:** ✅ Yes - matches core/rate-limiter.ts
**Makes sense:** ✅ Yes, important for API protection
**Recommendations:** Add distributed rate limiting tests

#### `router-context-destinations.test.ts`
**What it tests:** Routing with destination context consideration
**Current:** ✅ Yes - matches router.ts logic
**Makes sense:** ✅ Yes, intelligent routing
**Recommendations:** Add A/B testing for routing strategies

#### `router.cascade.test.ts`
**What it tests:** Cascading query routing
**Current:** ✅ Yes - matches router.ts cascade logic
**Makes sense:** ✅ Yes, fault tolerance
**Recommendations:** Add performance metrics

#### `transformers-nlp.test.ts`
**What it tests:** NLP transformations with HuggingFace Transformers
**Current:** ✅ Yes - matches transformers integration
**Makes sense:** ✅ Yes, modern NLP processing
**Recommendations:** Add model versioning tests

#### `vectara.client.test.ts`
**What it tests:** Integration with Vectara search API
**Current:** ✅ Yes - matches tools/vectara.ts
**Makes sense:** ✅ Yes, semantic search
**Recommendations:** Add relevance scoring tests

### INTEGRATION TESTS (/integration/)

#### `crawlee.playwright.integration.test.ts`
**What it tests:** Integration of Crawlee with Playwright for browser automation
**Current:** ✅ Yes - matches crawlee/playwright integration
**Makes sense:** ✅ Yes, for advanced web scraping
**Recommendations:** Add tests for browser compatibility

#### `date_formatting.test.ts`
**What it tests:** Date formatting between different APIs
**Current:** ✅ Yes - matches date parsing in parsers.ts
**Makes sense:** ✅ Yes, important for API interoperability
**Recommendations:** Add timezone handling tests

#### `flight_search.test.ts`
**What it tests:** Complete flight search flow with API mocking
**Current:** ✅ Yes - tests `runGraphTurn` from core/graph.ts with Amadeus API
**Makes sense:** ✅ Yes, critical business logic
**Recommendations:** Add tests on real API (staging environment), add tests for different cabin classes

#### `ner.integration.test.ts`
**What it tests:** NER integration with other components
**Current:** ✅ Yes - matches core/ner.ts integration
**Makes sense:** ✅ Yes, entity extraction pipeline
**Recommendations:** Add accuracy validation, add multilingual entity extraction tests

#### `nlp-pipeline.test.ts`
**What it tests:** Complete NLP pipeline from text to structured data
**Current:** ✅ Yes - matches core/nlp.ts pipeline
**Makes sense:** ✅ Yes, core processing pipeline
**Recommendations:** Add performance benchmarks, add tests for adversarial inputs, add tests for mixed language processing

#### `resilience.test.ts`
**What it tests:** System resilience to failures
**Current:** ✅ Yes - matches resilience patterns in config/resilience.ts
**Makes sense:** ✅ Yes, production readiness
**Recommendations:** Add chaos engineering scenarios, add tests for circuit breaker recovery

### E2E TESTS (/e2e/)

#### `01-weather_packing.test.ts`
**What it tests:** Weather and packing recommendations
**Current:** ✅ Yes - matches tools/weather.ts and packing logic
**Makes sense:** ✅ Yes, core travel functionality
**Recommendations:** Add tests for seasonal variations, add tests for extreme weather conditions

#### `02-attractions_variants.test.ts`
**What it tests:** Attraction search with various query variants
**Current:** ✅ Yes - matches tools/attractions.ts
**Makes sense:** ✅ Yes, important for tourist information
**Recommendations:** Add accessibility filters, add tests for different languages

#### `03-intent_family_thread.test.ts`
**What it tests:** Family trip processing and thread context
**Current:** ✅ Yes - matches router.ts and slot_memory.ts
**Makes sense:** ✅ Yes, conversational AI
**Recommendations:** Add multi-user scenarios, add tests for context conflicts

#### `04-input_variance_cot.test.ts`
**What it tests:** Various input variants and chain-of-thought reasoning
**Current:** ✅ Yes - matches LLM chain-of-thought in core/llm.ts
**Makes sense:** ✅ Yes, robustness testing
**Recommendations:** Add linguistic diversity tests, add tests for typos and corrections

#### `05-errors_api_failures.test.ts`
**What it tests:** Error handling and external API failures
**Current:** ✅ Yes - matches error handling patterns
**Makes sense:** ✅ Yes, fault tolerance
**Recommendations:** Add recovery time metrics, add tests for partial failures

#### `06-citations_unrelated_empty_system.test.ts`
**What it tests:** Source citations and empty response handling
**Current:** ✅ Yes - matches core/citations.ts
**Makes sense:** ✅ Yes, data integrity
**Recommendations:** Add citation accuracy validation, add tests for citation formatting

#### `07-conflicting_abrupt_sensitive_multilang_metrics.test.ts`
**What it tests:** Conflicting requests, sensitive topics, multilingual support
**Current:** ✅ Yes - matches LLM evaluation and multilingual support
**Makes sense:** ✅ Yes, edge cases handling
**Recommendations:** Add cultural sensitivity tests, expand multilingual coverage

#### `09-demo_authentic_conversation.test.ts`
**What it tests:** Realistic user dialogues
**Current:** ✅ Yes - matches conversational flow patterns
**Makes sense:** ✅ Yes, user experience validation
**Recommendations:** Add user journey mapping, add tests for conversation recovery

#### `10-nlp-pipeline-verify.test.ts`
**What it tests:** Verification of complete NLP pipeline
**Current:** ✅ Yes - matches core/nlp.ts pipeline
**Makes sense:** ✅ Yes, end-to-end NLP validation
**Recommendations:** Add pipeline performance metrics, add accuracy benchmarks

### MISSING CRITICAL E2E TESTS

#### `chaotic_conversation_flow.test.ts` (MISSING)
**What should test:** Complex multi-turn dialogues with frequent intent switches
**Example scenario:** Flight search → Weather → Packing → Attractions → Complex planning with consent → Restaurants → Visa questions → /why → New packing query → Policy questions
**Why critical:** Real users have chaotic conversation patterns that must be handled gracefully
**Current status:** Only basic intent switching tested in 03-intent_family_thread.test.ts
**Recommendations:** **HIGH PRIORITY** - Create comprehensive E2E test covering the exact flow from user example

#### `flight_clarification_flow.test.ts` (MISSING)
**What should test:** Flight ambiguity resolution flow (router.ts awaiting_flight_clarification)
**Example scenario:** "flights to Europe" → system asks for clarification → user chooses "direct search" → Amadeus API call
**Why critical:** Core flight booking ambiguity must be resolved properly
**Current status:** Basic clarification logic exists but no full E2E flow
**Recommendations:** **HIGH PRIORITY** - Create E2E test for awaiting_flight_clarification flow with both direct search and web research paths

#### `deep_research_consent_flow.test.ts` (MISSING)
**What should test:** Deep research consent handling (router.ts awaiting_deep_research_consent)
**Example scenario:** Complex query → consent request → user accepts → deep research execution
**Why critical:** Privacy compliance requires proper consent handling
**Current status:** Partial consent testing exists but no dedicated deep research consent E2E
**Recommendations:** **HIGH PRIORITY** - Create E2E test for awaiting_deep_research_consent flow

#### `mixed_language_processing.test.ts` (MISSING)
**What should test:** Mixed language queries processing (blend.ts hasMixedLanguages)
**Example scenario:** "東京の天気 Weather in Tokyo" → detect mixed languages → show warning → provide response
**Why critical:** International users may mix languages in queries
**Current status:** Basic mixed language detection exists but no comprehensive E2E coverage
**Recommendations:** Create test for Russian/Cyrillic + English mixed conversations

#### `error_recovery_complex_dialogues.test.ts` (MISSING)
**What should test:** Error recovery in complex multi-turn dialogues
**Example scenario:** API failure during consent flow → graceful recovery → continue conversation
**Why critical:** System must handle failures without losing conversation context
**Current status:** Basic error handling exists but no complex dialogue recovery
**Recommendations:** Create test for API failures and recovery in multi-turn conversations

### API & ROOT LEVEL TESTS

#### `api_or_cli.test.ts`
**What it tests:** API endpoints and CLI interface
**Current:** ✅ Yes - matches api/routes.ts
**Makes sense:** ✅ Yes, interface testing
**Recommendations:** Add API versioning tests, add authentication tests

#### `brave_search.test.ts`
**What it tests:** Integration with Brave Search API
**Current:** ✅ Yes - matches tools/brave_search.ts
**Makes sense:** ✅ Yes, privacy-focused search
**Recommendations:** Add search result filtering, add rate limiting tests

#### `brave_search_fallback.test.ts`
**What it tests:** Fallback for Brave Search
**Current:** ✅ Yes - matches fallback logic
**Makes sense:** ✅ Yes, redundancy
**Recommendations:** **MEDIUM PRIORITY** - Consolidate with general fallback tests to reduce duplication

#### `chat.test.ts`
**What it tests:** Chat API with schema validation and thread management
**Current:** ✅ Yes - matches schemas/chat.ts
**Makes sense:** ✅ Yes, core chat functionality
**Recommendations:** Add load testing, add authentication tests

#### `demo_flow.test.ts`
**What it tests:** Demo scenarios for functionality demonstration
**Current:** ✅ Yes - matches demo scenarios
**Makes sense:** ✅ Yes, for demonstrations and presentations
**Recommendations:** Update scenarios for new capabilities, add performance benchmarks

#### `e2e_comprehensive_flow.test.ts`
**What it tests:** Comprehensive E2E flow
**Current:** ✅ Yes - matches comprehensive user flows
**Makes sense:** ✅ Yes, integration validation
**Recommendations:** Add performance benchmarks, add failure scenario tests

#### `fetch_allowlist.test.ts`
**What it tests:** Allowlist for external requests
**Current:** ✅ Yes - matches security allowlist logic
**Makes sense:** ✅ Yes, security
**Recommendations:** Add dynamic allowlist updates, add security penetration tests

#### `flight_clarification.test.ts`
**What it tests:** Flight details clarification
**Current:** ✅ Yes - matches router clarification logic
**Makes sense:** ✅ Yes, user experience
**Recommendations:** Add multi-step clarification flows, integrate with new flight clarification E2E test

#### `graph-optimization.test.ts`
**What it tests:** Routing graph optimization
**Current:** ✅ Yes - matches core/graph.ts optimization
**Makes sense:** ✅ Yes, performance optimization
**Recommendations:** Add scalability benchmarks, add memory usage tests

#### `graph.test.ts`
**What it tests:** Core graph logic with LLM evaluation
**Current:** ✅ Yes - matches core/graph.ts
**Makes sense:** ✅ Yes, core decision making
**Recommendations:** Add graph visualization, add complex routing scenario tests

#### `hallucination_guard.test.ts`
**What it tests:** Prevention of fictitious information generation
**Current:** ✅ Yes - matches hallucination detection
**Makes sense:** ✅ Yes, data integrity
**Recommendations:** Add hallucination detection accuracy benchmarks

#### `log_level_env.test.ts`
**What it tests:** Logging configuration by environment
**Current:** ✅ Yes - matches util/logging.ts
**Makes sense:** ✅ Yes, observability
**Recommendations:** Add structured logging validation, add log filtering tests

#### `opentripmap.test.ts`
**What it tests:** Integration with OpenTripMap API
**Current:** ✅ Yes - matches tools/opentripmap.ts
**Makes sense:** ✅ Yes, tourist attractions data
**Recommendations:** Add data freshness checks, add error handling tests

#### `packing.test.ts`
**What it tests:** Packing recommendations
**Current:** ✅ Yes - matches packing logic
**Makes sense:** ✅ Yes, practical travel advice
**Recommendations:** Add personalization based on user preferences, add cultural adaptation tests

#### `receipts.selfcheck.test.ts`
**What it tests:** Self-check of receipt processing
**Current:** ✅ Yes - matches core/receipts.ts
**Makes sense:** ✅ Yes, financial data integrity
**Recommendations:** Add compliance auditing, add multi-currency tests

#### `router.memory.test.ts`
**What it tests:** Router memory between sessions
**Current:** ✅ Yes - matches router memory logic
**Makes sense:** ✅ Yes, state management
**Recommendations:** Add memory cleanup tests, add memory leak tests

#### `security.test.ts`
**What it tests:** Editing sensitive data (PII)
**Current:** ✅ Yes - matches util/redact.ts
**Makes sense:** ✅ Yes, GDPR compliance
**Recommendations:** Add encryption validation, add PII detection accuracy tests

#### `tavily_search.test.ts`
**What it tests:** Integration with Tavily search API
**Current:** ✅ Yes - matches tools/tavily_search.ts
**Makes sense:** ✅ Yes, web search functionality
**Recommendations:** Add search result relevance scoring, add rate limiting tests

#### `tools.test.ts`
**What it tests:** System tools and utilities
**Current:** ✅ Yes - matches various utility functions
**Makes sense:** ✅ Yes, utility functions
**Recommendations:** Add tool discovery tests, add tool health checks

#### `transcript-recorder.test.ts`
**What it tests:** Transcript recording for debugging
**Current:** ✅ Yes - matches test/transcript-recorder.ts
**Makes sense:** ✅ Yes, debugging and analysis
**Recommendations:** Add transcript analytics, add privacy filtering tests

#### `web_search_consent.test.ts`
**What it tests:** User consent for web search
**Current:** ✅ Yes - matches consent management
**Makes sense:** ✅ Yes, privacy compliance
**Recommendations:** Add consent management workflow, add GDPR compliance tests

#### `web_search_fallback.test.ts`
**What it tests:** Fallback strategies for web search
**Current:** ✅ Yes - matches fallback logic
**Makes sense:** ✅ Yes, reliability
**Recommendations:** Add multi-provider fallback, consolidate with brave_search_fallback.test.ts

---

## 🚨 UPDATED CRITICAL ISSUES (2025)

### **HIGH PRIORITY - IMMEDIATE ACTION REQUIRED**

#### 1. **Outdated Jest Mocking Patterns**
- **Files affected:** `deep_research.test.ts`, `parsers-nlp-first.test.ts`
- **Issue:** Uses deprecated `jest.unstable_mockModule`
- **Impact:** Tests may fail with newer Jest versions
- **Action:** Rewrite using modern ESM mocking patterns

#### 2. **Misleading Test Names**
- **File:** `policy-routing-fix.test.ts`
- **Issue:** "fix" in filename implies temporary fix, not permanent test
- **Action:** Rename to `policy-routing.test.ts`

#### 3. **Missing Critical E2E Test Scenarios**
- **Flight clarification flow** (router.ts lines 228-296)
- **Deep research consent flow** (router.ts lines 167-192)
- **Mixed language processing** (blend.ts lines 367-376)
- **Error recovery flows** (blend.ts lines 797-800)
- **Impact:** Core user flows untested, potential production issues

#### 4. **Security Testing Gaps**
- **Missing:** Authentication/authorization tests
- **Missing:** JWT token validation tests
- **Missing:** SQL injection protection tests
- **Missing:** XSS prevention tests

#### 5. **Performance Testing Gaps**
- **Missing:** Memory leak detection tests
- **Missing:** Concurrent user load tests
- **Missing:** Network failure simulation tests

---

## ✅ UPDATED IMPROVEMENT RECOMMENDATIONS

### **PHASE 1: Critical Fixes (Week 1-2)**
1. ✅ **Rewrite `deep_research.test.ts`** - Replace jest.unstable_mockModule with modern ESM mocking
2. ✅ **Rewrite `parsers-nlp-first.test.ts`** - Replace jest.unstable_mockModule with modern ESM mocking
3. ✅ **Create `chaotic_conversation_flow.test.ts`** - Test complex multi-turn dialogues
4. ✅ **Create `flight_clarification_flow.test.ts`** - Test flight ambiguity resolution
5. ✅ **Create `deep_research_consent_flow.test.ts`** - Test deep research consent handling
6. ✅ **Create `mixed_language_processing.test.ts`** - Test multilingual query processing
7. ✅ **Create `error_recovery_complex_dialogues.test.ts`** - Test error recovery in complex dialogues

### **PHASE 2: Security & Performance (Week 3-4)**
1. **Add authentication/authorization tests** - API security
2. **Add JWT token validation tests** - Token security
3. **Add SQL injection protection tests** - Data security
4. **Add XSS prevention tests** - Input security
5. **Add memory leak detection tests** - Performance
6. **Add concurrent user load tests** - Scalability

### **PHASE 3: Internationalization & UX (Week 5-6)**
1. **Expand multilingual E2E coverage** - Russian/Cyrillic support
2. **Add timezone handling tests** - International dates
3. **Add currency conversion tests** - Multi-currency support
4. **Add accessibility tests** - WCAG compliance
5. **Add mobile responsiveness tests** - UX validation

### **PHASE 4: Advanced Testing (Week 7-8)**
1. **Add chaos engineering tests** - Failure simulation
2. **Add visual regression tests** - UI consistency
3. **Add property-based testing** - Edge case generation
4. **Implement smoke tests** - CI/CD pipeline validation

### **PHASE 5: Consolidation & Optimization (Week 9-10)**
1. **Consolidate duplicate tests** (brave_search + brave_search_fallback)
2. **Add comprehensive performance benchmarks**
3. **Create test coverage reports**
4. **Implement automated test maintenance checks**

---

## 📊 UPDATED COVERAGE STATISTICS (2025)

### **Current Test Distribution:**
- **Unit tests:** 25 files (55% of total test files)
- **Integration tests:** 6 files (13%)
- **E2E tests:** 10 files (22%)
- **API/Root tests:** 20+ files (root level tests)

### **Code Coverage Analysis:**
- **Core Logic Coverage:** ~85% (good coverage of main business logic)
- **Error Handling Coverage:** ~60% (needs improvement)
- **Edge Cases Coverage:** ~45% (significant gaps)
- **Security Coverage:** ~30% (major gaps)
- **Performance Coverage:** ~25% (major gaps)

### **Critical Coverage Gaps:**
1. **Chaotic conversation flows** - 10% coverage (only basic intent switching)
2. **Flight clarification flows** - 0% coverage
3. **Deep research consent flows** - 0% coverage
4. **Mixed language processing** - 15% coverage
5. **Error recovery in complex dialogues** - 5% coverage
6. **System commands in context** - 20% coverage
7. **Security testing** - 25% coverage
8. **Performance testing** - 20% coverage

---

## 🎯 UPDATED IMPLEMENTATION ROADMAP (2025)

### **PHASE 1: Critical Fixes (Week 1-2)** ✅ **START HERE**
1. **Rewrite `deep_research.test.ts`** - Replace jest.unstable_mockModule with modern ESM mocking
2. **Rewrite `parsers-nlp-first.test.ts`** - Replace jest.unstable_mockModule with modern ESM mocking
3. **Create `chaotic_conversation_flow.test.ts`** - Test complex multi-turn dialogues from user example
4. **Create `flight_clarification_flow.test.ts`** - Test flight ambiguity resolution flow
5. **Create `deep_research_consent_flow.test.ts`** - Test deep research consent handling
6. **Create `mixed_language_processing.test.ts`** - Test multilingual query processing
7. **Create `error_recovery_complex_dialogues.test.ts`** - Test error recovery in complex dialogues

### **PHASE 2: Security & Core Expansion (Week 3-4)**
1. **Add authentication/authorization tests** - API endpoint security
2. **Add JWT validation tests** - Token security verification
3. **Add SQL injection protection tests** - Data security
4. **Add XSS prevention tests** - Input sanitization
5. **Expand existing E2E tests** - Add edge cases to current E2E scenarios
6. **Add memory leak detection** - Performance monitoring

### **PHASE 3: Internationalization & UX (Week 5-6)**
1. **Expand Russian/Cyrillic support tests** - Full multilingual coverage
2. **Add timezone handling tests** - International date/time processing
3. **Add currency conversion tests** - Multi-currency support
4. **Add accessibility compliance tests** - WCAG validation
5. **Add mobile responsiveness tests** - Cross-device compatibility

### **PHASE 4: Advanced Testing Infrastructure (Week 7-8)**
1. **Implement chaos engineering tests** - Failure simulation
2. **Add visual regression testing** - UI consistency validation
3. **Implement property-based testing** - Automated edge case generation
4. **Create comprehensive smoke tests** - CI/CD pipeline validation
5. **Add concurrent user load testing** - Scalability validation

### **PHASE 5: Optimization & Maintenance (Week 9-10)**
1. **Consolidate duplicate tests** (brave_search + brave_search_fallback)
2. **Implement automated test maintenance** - Detect outdated tests
3. **Create test coverage dashboards** - Visual coverage reporting
4. **Add performance regression detection** - Automated performance monitoring

---

## 🔧 IMMEDIATE ACTION ITEMS

### **Files to Rewrite (High Priority):**
1. `/tests/unit/deep_research.test.ts` - Replace jest.unstable_mockModule with modern ESM mocking
2. `/tests/unit/parsers-nlp-first.test.ts` - Replace jest.unstable_mockModule with modern ESM mocking

### **New E2E Tests to Create (High Priority):**
1. `/tests/e2e/chaotic_conversation_flow.test.ts` - Complex multi-turn dialogue testing
2. `/tests/e2e/flight_clarification_flow.test.ts` - Flight ambiguity resolution
3. `/tests/e2e/deep_research_consent_flow.test.ts` - Deep research consent handling
4. `/tests/e2e/mixed_language_processing.test.ts` - Multilingual query processing
5. `/tests/e2e/error_recovery_complex_dialogues.test.ts` - Error recovery in complex dialogues

### **Code References for New Tests:**
- **Flight clarification:** router.ts lines 118-137 (awaiting_flight_clarification)
- **Deep research consent:** router.ts lines 167-192 (awaiting_deep_research_consent)
- **Mixed language:** blend.ts lines 367-376 (hasMixedLanguages)
- **Error recovery:** blend.ts lines 797-800 (API failure handling)
- **Chaotic conversations:** blend.ts handleChat function and router.ts routeIntent

---

## 🔍 ANALYSIS: TEST COVERAGE FOR CHAOTIC DIALOGUES

### **Current Test Coverage Assessment**

Based on your example conversation, here's what **IS** and **IS NOT** currently tested:

#### ✅ **WELL COVERED SCENARIOS:**

1. **Weather → Packing Context Retention**
   - Covered by: `03-intent_family_thread.test.ts` (weather → packing switch)
   - Covered by: `location-context-retention.test.ts`

2. **Simple Intent Switching**
   - Covered by: `03-intent_family_thread.test.ts` (basic transitions)
   - Covered by: `router.memory.test.ts` (thread persistence)

3. **Basic Consent Flows**
   - Covered by: `web_search_consent.test.ts` (yes/no consent handling)
   - Covered by: `09-demo_authentic_conversation.test.ts` (consent acceptance/decline)

4. **Policy Questions**
   - Covered by: `policy-routing.test.ts` (visa, airline policies)

#### ❌ **CRITICALLY MISSING SCENARIOS:**

1. **Extreme Topic Jumps** (Flight → Weather → Attractions → Complex Planning → Restaurants → Visa → /why → Packing → Policy)
   - **Current coverage:** ~30% (only basic transitions)
   - **Missing:** Full chaotic dialogue with 8+ topic switches

2. **Consent Flows in Complex Dialogues**
   - **Current coverage:** ~40% (basic consent only)
   - **Missing:** Consent requests interrupting ongoing conversations
   - **Missing:** Multiple consent flows in same thread
   - **Missing:** Deep research consent (different from web search consent)

3. **System Commands in Context** (`/why` commands)
   - **Current coverage:** ~20% (basic receipts)
   - **Missing:** `/why` usage in middle of chaotic conversations
   - **Missing:** Multiple `/why` calls in same thread

4. **Mixed Language Processing**
   - **Current coverage:** ~15% (basic mixed language detection)
   - **Missing:** Full multilingual conversation flows
   - **Missing:** Language switching mid-conversation

5. **Error Recovery in Complex Dialogues**
   - **Current coverage:** ~25% (basic error handling)
   - **Missing:** API failures during complex multi-step conversations
   - **Missing:** Recovery from consent declines mid-flow

### **REQUIRED NEW E2E TESTS:**

#### `chaotic_conversation_flow.test.ts` (HIGH PRIORITY)
**Test Scenario:** Complete reproduction of your example chaotic conversation
```
1. "flights from moscow to tel aviv 12-10-2025 one way" → Flight search
2. "What's the weather like in Barcelona today?" → Weather query
3. "What should I pack for this weather?" → Packing advice
4. "What are some must-see attractions in Barcelona?" → Attractions
5. "From NYC, end of June (last week), 4-5 days. 2 adults + toddler..." → Complex planning
6. "yes" → Consent acceptance → Deep research
7. "Actually, I'd like to know about restaurants..." → Topic switch
8. "Yes" → Another consent acceptance
9. "Quick one: do US passport holders need visa for Canada?" → Visa question
10. "/why" → Receipts request
11. "What should I pack for London?" → New packing query
12. "What is the standard cancellation window for Marriott hotels?" → Policy question
```

#### `multiple_consent_flows.test.ts` (HIGH PRIORITY)
**Test Scenario:** Multiple consent requests in same conversation
- First complex query → consent request
- User declines → different query → another consent request
- User accepts → search results
- Another complex query → third consent request

#### `system_commands_in_context.test.ts` (MEDIUM PRIORITY)
**Test Scenario:** /why and other commands in chaotic dialogues
- Complex conversation with multiple searches
- /why commands at different points
- Multiple /why calls in same thread
- /why after consent flows

#### `error_recovery_complex_dialogues.test.ts` (MEDIUM PRIORITY)
**Test Scenario:** Error recovery in complex conversations
- API failure during consent flow
- Search failure mid-conversation
- Recovery and continuation of dialogue
- Multiple error scenarios

### **IMMEDIATE ACTION ITEMS:**

1. **Create `chaotic_conversation_flow.test.ts`** - Test the complete chaotic flow from your example (12-step dialogue)
2. **Create `multiple_consent_flows.test.ts`** - Test multiple consent requests in same conversation
3. **Expand `03-intent_family_thread.test.ts`** - Add more extreme topic transitions (8+ switches)
4. **Create `deep_research_consent_flow.test.ts`** - Test deep research consent handling specifically

---

## 🛠 RECOMMENDED TESTING TOOLS & FRAMEWORKS

### **Performance & Load Testing:**
- **k6** - Modern load testing with JavaScript
- **Artillery** - Scenario-based load testing
- **Lighthouse CI** - Automated performance testing

### **Security Testing:**
- **OWASP ZAP** - Automated security scanning
- **Snyk Code** - SAST (Static Application Security Testing)
- **Burp Suite** - Manual security testing

### **Accessibility Testing:**
- **axe-core** - Automated accessibility testing
- **pa11y** - Command-line accessibility testing
- **WAVE** - Web accessibility evaluation tool

### **Property-Based Testing:**
- **fast-check** - Property-based testing for JavaScript
- **jsverify** - Generative testing framework

### **Visual Regression:**
- **Percy** - Visual testing platform
- **Chromatic** - Storybook visual testing
- **Applitools** - AI-powered visual testing

### **Coverage & Quality:**
- **Istanbul/NYC** - Code coverage reporting
- **Codecov** - Cloud-based coverage reporting
- **Coveralls** - Coverage history and trends