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

### UNIT TESTS (/unit/)

#### `amadeus_flights.test.ts`
**What it tests:** Integration with Amadeus API for flight search, including authorization tokens, response processing, and date conversion
**Current:** ✅ Yes - code matches tests, functions `searchFlights`, `convertToAmadeusDate` exist and work as expected
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
**What it tests:** Deep analysis and data research
**Current:** ❌ No - uses outdated Jest mocking patterns (unstable_mockModule), doesn't match current deep_research.ts interface
**Makes sense:** ✅ Yes, for complex queries
**Recommendations:** Rewrite using modern Jest mocking, align with current performDeepResearch function signature

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
**What it tests:** Primary NLP parsing of incoming queries
**Current:** ✅ Yes - matches core/parsers.ts
**Makes sense:** ✅ Yes, entry point for all text queries
**Recommendations:** Add A/B testing framework

#### `parsers.od.test.ts`
**What it tests:** Parsing data from Amadeus API responses
**Current:** ✅ Yes - matches Amadeus parsing logic
**Makes sense:** ✅ Yes, critical for flight data processing
**Recommendations:** Add schema validation tests

#### `policy-routing-fix.test.ts`
**What it tests:** Fixes in policy routing logic
**Current:** ❌ No - confusing filename with "fix", policy intent still supported but name misleading
**Makes sense:** ✅ Yes, but name with "fix" can be misleading
**Recommendations:** Rename to `policy-routing.test.ts` for clarity

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
**Recommendations:** Add tests on real API (staging environment)

#### `ner.integration.test.ts`
**What it tests:** NER integration with other components
**Current:** ✅ Yes - matches core/ner.ts integration
**Makes sense:** ✅ Yes, entity extraction pipeline
**Recommendations:** Add accuracy validation

#### `nlp-pipeline.test.ts`
**What it tests:** Complete NLP pipeline from text to structured data
**Current:** ✅ Yes - matches core/nlp.ts pipeline
**Makes sense:** ✅ Yes, core processing pipeline
**Recommendations:** Add performance benchmarks, add tests for adversarial inputs

#### `resilience.test.ts`
**What it tests:** System resilience to failures
**Current:** ✅ Yes - matches resilience patterns in config/resilience.ts
**Makes sense:** ✅ Yes, production readiness
**Recommendations:** Add chaos engineering scenarios

### E2E TESTS (/e2e/)

#### `01-weather_packing.test.ts`
**What it tests:** Weather and packing recommendations
**Current:** ✅ Yes - matches tools/weather.ts and packing logic
**Makes sense:** ✅ Yes, core travel functionality
**Recommendations:** Add tests for seasonal variations

#### `02-attractions_variants.test.ts`
**What it tests:** Attraction search with various query variants
**Current:** ✅ Yes - matches tools/attractions.ts
**Makes sense:** ✅ Yes, important for tourist information
**Recommendations:** Add accessibility filters

#### `03-intent_family_thread.test.ts`
**What it tests:** Family trip processing and thread context
**Current:** ✅ Yes - matches router.ts and slot_memory.ts
**Makes sense:** ✅ Yes, conversational AI
**Recommendations:** Add multi-user scenarios

#### `04-input_variance_cot.test.ts`
**What it tests:** Various input variants and chain-of-thought reasoning
**Current:** ✅ Yes - matches LLM chain-of-thought in core/llm.ts
**Makes sense:** ✅ Yes, robustness testing
**Recommendations:** Add linguistic diversity tests

#### `05-errors_api_failures.test.ts`
**What it tests:** Error handling and external API failures
**Current:** ✅ Yes - matches error handling patterns
**Makes sense:** ✅ Yes, fault tolerance
**Recommendations:** Add recovery time metrics

#### `06-citations_unrelated_empty_system.test.ts`
**What it tests:** Source citations and empty response handling
**Current:** ✅ Yes - matches core/citations.ts
**Makes sense:** ✅ Yes, data integrity
**Recommendations:** Add citation accuracy validation

#### `07-conflicting_abrupt_sensitive_multilang_metrics.test.ts`
**What it tests:** Conflicting requests, sensitive topics, multilingual support
**Current:** ✅ Yes - matches LLM evaluation and multilingual support
**Makes sense:** ✅ Yes, edge cases handling
**Recommendations:** Add cultural sensitivity tests

#### `09-demo_authentic_conversation.test.ts`
**What it tests:** Realistic user dialogues
**Current:** ✅ Yes - matches conversational flow patterns
**Makes sense:** ✅ Yes, user experience validation
**Recommendations:** Add user journey mapping

#### `10-nlp-pipeline-verify.test.ts`
**What it tests:** Verification of complete NLP pipeline
**Current:** ✅ Yes - matches core/nlp.ts pipeline
**Makes sense:** ✅ Yes, end-to-end NLP validation
**Recommendations:** Add pipeline performance metrics

### API & ROOT LEVEL TESTS

#### `api_or_cli.test.ts`
**What it tests:** API endpoints and CLI interface
**Current:** ✅ Yes - matches api/routes.ts
**Makes sense:** ✅ Yes, interface testing
**Recommendations:** Add API versioning tests

#### `brave_search.test.ts`
**What it tests:** Integration with Brave Search API
**Current:** ✅ Yes - matches tools/brave_search.ts
**Makes sense:** ✅ Yes, privacy-focused search
**Recommendations:** Add search result filtering

#### `brave_search_fallback.test.ts`
**What it tests:** Fallback for Brave Search
**Current:** ✅ Yes - matches fallback logic
**Makes sense:** ✅ Yes, redundancy
**Recommendations:** Consolidate with general fallback tests

#### `chat.test.ts`
**What it tests:** Chat API with schema validation and thread management
**Current:** ✅ Yes - matches schemas/chat.ts
**Makes sense:** ✅ Yes, core chat functionality
**Recommendations:** Add load testing

#### `demo_flow.test.ts`
**What it tests:** Demo scenarios for functionality demonstration
**Current:** ✅ Yes - matches demo scenarios
**Makes sense:** ✅ Yes, for demonstrations and presentations
**Recommendations:** Update scenarios for new capabilities

#### `e2e_comprehensive_flow.test.ts`
**What it tests:** Comprehensive E2E flow
**Current:** ✅ Yes - matches comprehensive user flows
**Makes sense:** ✅ Yes, integration validation
**Recommendations:** Add performance benchmarks

#### `fetch_allowlist.test.ts`
**What it tests:** Allowlist for external requests
**Current:** ✅ Yes - matches security allowlist logic
**Makes sense:** ✅ Yes, security
**Recommendations:** Add dynamic allowlist updates

#### `flight_clarification.test.ts`
**What it tests:** Flight details clarification
**Current:** ✅ Yes - matches router clarification logic
**Makes sense:** ✅ Yes, user experience
**Recommendations:** Add multi-step clarification flows

#### `graph-optimization.test.ts`
**What it tests:** Routing graph optimization
**Current:** ✅ Yes - matches core/graph.ts optimization
**Makes sense:** ✅ Yes, performance optimization
**Recommendations:** Add scalability benchmarks

#### `graph.test.ts`
**What it tests:** Core graph logic with LLM evaluation
**Current:** ✅ Yes - matches core/graph.ts
**Makes sense:** ✅ Yes, core decision making
**Recommendations:** Add graph visualization

#### `hallucination_guard.test.ts`
**What it tests:** Prevention of fictitious information generation
**Current:** ✅ Yes - matches hallucination detection
**Makes sense:** ✅ Yes, data integrity
**Recommendations:** Add hallucination detection accuracy

#### `log_level_env.test.ts`
**What it tests:** Logging configuration by environment
**Current:** ✅ Yes - matches util/logging.ts
**Makes sense:** ✅ Yes, observability
**Recommendations:** Add structured logging validation

#### `opentripmap.test.ts`
**What it tests:** Integration with OpenTripMap API
**Current:** ✅ Yes - matches tools/opentripmap.ts
**Makes sense:** ✅ Yes, tourist attractions data
**Recommendations:** Add data freshness checks

#### `packing.test.ts`
**What it tests:** Packing recommendations
**Current:** ✅ Yes - matches packing logic
**Makes sense:** ✅ Yes, practical travel advice
**Recommendations:** Add personalization based on user preferences

#### `receipts.selfcheck.test.ts`
**What it tests:** Self-check of receipt processing
**Current:** ✅ Yes - matches core/receipts.ts
**Makes sense:** ✅ Yes, financial data integrity
**Recommendations:** Add compliance auditing

#### `router.memory.test.ts`
**What it tests:** Router memory between sessions
**Current:** ✅ Yes - matches router memory logic
**Makes sense:** ✅ Yes, state management
**Recommendations:** Add memory cleanup tests

#### `security.test.ts`
**What it tests:** Editing sensitive data (PII)
**Current:** ✅ Yes - matches util/redact.ts
**Makes sense:** ✅ Yes, GDPR compliance
**Recommendations:** Add encryption validation

#### `tavily_search.test.ts`
**What it tests:** Integration with Tavily search API
**Current:** ✅ Yes - matches tools/tavily_search.ts
**Makes sense:** ✅ Yes, web search functionality
**Recommendations:** Add search result relevance scoring

#### `tools.test.ts`
**What it tests:** System tools and utilities
**Current:** ✅ Yes - matches various utility functions
**Makes sense:** ✅ Yes, utility functions
**Recommendations:** Add tool discovery tests

#### `transcript-recorder.test.ts`
**What it tests:** Transcript recording for debugging
**Current:** ✅ Yes - matches test/transcript-recorder.ts
**Makes sense:** ✅ Yes, debugging and analysis
**Recommendations:** Add transcript analytics

#### `web_search_consent.test.ts`
**What it tests:** User consent for web search
**Current:** ✅ Yes - matches consent management
**Makes sense:** ✅ Yes, privacy compliance
**Recommendations:** Add consent management workflow

#### `web_search_fallback.test.ts`
**What it tests:** Fallback strategies for web search
**Current:** ✅ Yes - matches fallback logic
**Makes sense:** ✅ Yes, reliability
**Recommendations:** Add multi-provider fallback

---

## 🚨 CRITICAL ISSUES IDENTIFIED (2025 UPDATE)

### High Priority Issues:
1. **Outdated mocking patterns** - `deep_research.test.ts` uses deprecated Jest unstable_mockModule
2. **Misleading test names** - `policy-routing-fix.test.ts` should be renamed
3. **Missing flight clarification flow tests** - no E2E tests for flight ambiguity resolution
4. **No deep research consent flow tests** - missing E2E coverage for complex query handling
5. **Lack of multi-language E2E tests** - insufficient multilingual coverage

### Missing Critically Important Tests:

#### 🔐 Security & Authentication
- **Authentication & Authorization** - API security tests
- **JWT token validation** - token verification
- **Session management** - session handling
- **Rate limit bypass tests** - attempts to bypass restrictions
- **SQL injection tests** - SQL injection protection
- **XSS prevention tests** - cross-site scripting protection
- **CSRF protection tests** - cross-site request forgery protection

#### 🗄️ Database & Persistence
- **Database persistence tests** - state preservation verification
- **Data migration tests** - schema update verification
- **Multi-tenancy tests** - user data isolation
- **Database connection pooling** - connection management
- **Transaction integrity** - transaction integrity

#### 🌐 Internationalization & Localization
- **Internationalization tests** - support for different languages/regions
- **Timezone handling** - working with timezones
- **Currency conversion** - currency conversion
- **Date format variations** - various date formats
- **Cultural context** - cultural context

#### ♿ Accessibility & UX
- **Accessibility tests** - WCAG compliance
- **Mobile responsiveness** - UI tests for mobile devices
- **Keyboard navigation** - keyboard navigation
- **Screen reader compatibility** - screen reader compatibility

#### 🔄 Real-time & Async Features
- **Offline functionality** - work without internet
- **Real-time features** - WebSocket connections, live updates
- **Background job processing** - background tasks
- **Queue management** - queue management

#### 📊 Performance & Scalability
- **Memory leak tests** - memory leak detection
- **Concurrent user tests** - load from multiple users
- **Network failure tests** - complete network connection loss
- **Caching strategy tests** - caching strategies
- **CDN integration tests** - CDN integration

#### 🤖 AI/ML Specific
- **Model accuracy degradation** - model accuracy degradation
- **Prompt injection attacks** - prompt-based attacks
- **Hallucination detection accuracy** - hallucination detection accuracy
- **Model fallback strategies** - model fallback strategies
- **Training data drift** - training data drift

---

## ✅ IMPROVEMENT RECOMMENDATIONS

### High priority:
1. **Rename `policy-routing-fix.test.ts`** → `policy-routing.test.ts`
2. **Add performance tests** for all critical paths
3. **Create authentication/authorization tests**
4. **Add security penetration tests**
5. **Create database integration tests**
6. **Add load testing suite with k6 or Artillery**

### Medium priority:
1. **Expand E2E coverage** to missing scenarios
2. **Add internationalization tests**
3. **Create accessibility tests**
4. **Add data integrity validation**
5. **Create memory leak detection tests**
6. **Add concurrent user testing**

### Low priority:
1. **Consolidate similar tests** (brave_search + brave_search_fallback)
2. **Add visual regression testing** for UI
3. **Create chaos engineering tests**
4. **Add API documentation tests**
5. **Implement property-based testing** for edge cases
6. **Add smoke tests** for CI/CD pipeline

---

## 📊 COVERAGE STATISTICS

- **Unit tests:** 25 files (60% of total)
- **Integration tests:** 6 files (15%)
- **E2E tests:** 10 files (25%)
- **API/Security tests:** 20+ files (root level tests)

**Recommended distribution:**
- Unit: 50%
- Integration: 30%
- E2E: 20%

**Current coverage:** Good for unit level, insufficient for integration/E2E and security

---

## 🎯 PRIORITIES FOR REWRITING

### High priority:
1. `policy-routing-fix.test.ts` - rename and verify currency
2. Add performance tests for all critical paths
3. Create load testing suite
4. Add security penetration tests

### Medium priority:
1. Expand E2E coverage to missing scenarios
2. Add internationalization tests
3. Create accessibility tests
4. Add data integrity validation

### Low priority:
1. Consolidate similar tests
2. Add visual regression testing
3. Create chaos engineering tests
4. Add API documentation tests

---

## 🔍 CODE-DERIVED MISSING SCENARIOS (2025 ANALYSIS)

### Flight & Booking Scenarios (Critical Missing):
1. **Flight ambiguity resolution** - E2E tests for `awaiting_flight_clarification` flow in router.ts (lines 228-296)
2. **Deep research consent flow** - E2E tests for `awaiting_deep_research_consent` handling in router.ts (lines 167-192)
3. **Mixed language flight queries** - Tests for `hasMixedLanguages` handling in blend.ts (lines 367-376)
4. **Flight search API failures** - Recovery scenarios when Amadeus API fails (graph.ts lines 1767-1768)
5. **Thread context in flight search** - Tests for slot memory persistence across flight queries

### Conversational AI Scenarios (Critical Missing):
1. **Thread context retention** - E2E tests for slot_memory.ts persistence across sessions
2. **Context switching detection** - Tests for handling topic changes mid-conversation
3. **Ambiguous intent resolution** - Tests for clarification requests in blend.ts (lines 380-534)
4. **System question handling** - Tests for AI assistant identity questions (blend.ts lines 298-305)
5. **Unrelated content filtering** - Tests for content classification edge cases (blend.ts lines 428-436)
6. **Error recovery flows** - Tests for graceful degradation when APIs fail (blend.ts lines 797-800)

### Web Search & Research Scenarios (Critical Missing):
1. **Web search consent flow** - E2E tests for `web_search_consent` handling
2. **Deep research summarization** - Tests for Crawlee deep research results in blend.ts (lines 204-212)
3. **Search result verification** - Tests for citation validation in verify.ts
4. **Fallback search strategies** - Tests for Brave/Tavily/Vectara fallback chains
5. **Complex query optimization** - Tests for query optimization in llm.ts

### Internationalization & NLP Scenarios (Critical Missing):
1. **Multi-language entity extraction** - Tests for Russian/Cyrillic in ner.ts (lines 371-375)
2. **Mixed language processing** - Tests for blend.ts mixed language handling (lines 952-955)
3. **Cultural context adaptation** - Tests for cultural sensitivity in responses
4. **Non-Latin script processing** - Tests for Japanese/Chinese character handling in parsers.ts
5. **Regional date formats** - Tests for various date format parsing in parsers.ts

### Travel Planning Scenarios (Missing):
1. **Multi-city itineraries** - planning trips with multiple destinations
2. **Group/family bookings** - coordinating travel for multiple people
3. **Business travel policies** - corporate booking restrictions
4. **Budget constraints** - finding options within price limits
5. **Travel insurance** - insurance recommendations and booking
6. **Visa requirements** - checking passport/travel document needs
7. **Health/safety alerts** - current travel warnings and advisories
8. **Carbon footprint** - eco-friendly travel options
9. **Accessibility needs** - travel for people with disabilities
10. **Pet travel** - requirements for traveling with animals

### Conversational AI Scenarios (Missing):
1. **Context switching** - handling topic changes mid-conversation
2. **Ambiguous queries** - clarifying vague or incomplete requests
3. **Follow-up questions** - building on previous responses
4. **Correction handling** - when user changes their mind
5. **Multi-intent queries** - handling multiple requests in one message
6. **Time-sensitive updates** - dealing with changing information
7. **Personalization** - adapting to user preferences over time
8. **Error recovery** - handling and recovering from mistakes
9. **Cultural sensitivity** - appropriate responses for different cultures
10. **Emergency situations** - handling urgent travel needs

### Integration Scenarios (Missing):
1. **Third-party booking** - integration with booking platforms
2. **Calendar integration** - syncing with personal calendars
3. **Payment processing** - secure payment handling
4. **Loyalty programs** - integration with airline/hotel rewards
5. **Travel tracking** - real-time flight/train tracking
6. **Weather integration** - dynamic weather-based recommendations
7. **Currency conversion** - real-time exchange rates
8. **Language translation** - multi-language support
9. **Offline functionality** - working without internet
10. **Cross-device continuity** - seamless experience across devices

---

## 🎯 UPDATED IMPLEMENTATION ROADMAP (2025)

### PHASE 1: Critical Fixes (Week 1-2)
1. **Fix `deep_research.test.ts`** - Rewrite with modern Jest mocking, align with current interface
2. **Rename `policy-routing-fix.test.ts`** → `policy-routing.test.ts` for clarity
3. **Add flight clarification E2E test** - Test router.ts `awaiting_flight_clarification` flow
4. **Add deep research consent E2E test** - Test router.ts `awaiting_deep_research_consent` flow

### PHASE 2: Core Coverage Expansion (Week 3-4)
1. **Add multi-language E2E tests** - Test Russian/Cyrillic processing in blend.ts/ner.ts
2. **Add error recovery E2E tests** - Test graceful degradation scenarios
3. **Add thread context E2E tests** - Test slot_memory.ts persistence
4. **Add web search consent E2E tests** - Test search consent flows

### PHASE 3: Advanced Features (Week 5-6)
1. **Add performance test suite** - k6 tests for critical paths
2. **Add security penetration tests** - OWASP ZAP integration
3. **Add load testing suite** - Artillery for concurrent users
4. **Add internationalization tests** - Multi-language support validation

### PHASE 4: Quality Assurance (Week 7-8)
1. **Add accessibility tests** - axe-core integration
2. **Add chaos engineering tests** - Gremlin for failure simulation
3. **Add visual regression tests** - Percy for UI consistency
4. **Add property-based tests** - fast-check for edge cases

---

## 🛠 RECOMMENDED TOOLS FOR EXPANDING TEST COVERAGE

1. **Performance Testing:** k6, Artillery, Lighthouse CI
2. **Security Testing:** OWASP ZAP, Burp Suite, Snyk Code
3. **Accessibility:** axe-core, pa11y, WAVE Evaluation Tool
4. **Load Testing:** JMeter, Gatling, k6 with load impact
5. **Property-based:** fast-check, jsverify for generative testing
6. **Visual Regression:** Percy, Chromatic, Applitools
7. **Chaos Engineering:** Chaos Monkey, Gremlin, LitmusChaos
8. **API Testing:** Postman Newman, REST-assured
9. **Multi-language:** Cypress with i18n plugins, Playwright localization
10. **Coverage Analysis:** Istanbul/NYC, Codecov, Coveralls