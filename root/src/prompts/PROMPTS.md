# Prompt Templates Documentation

This document provides a comprehensive overview of all prompt templates in the `/src/prompts` directory. These prompts are used throughout the Navan travel assistant system to guide LLM interactions for various NLP tasks, routing decisions, and response generation.

## Prompt Categories

### Core System Prompts

1. [system.md](#systemmd) - Core system identity and behavior guidelines
2. [cot.md](#cotmd) - Chain-of-thought reasoning for complex travel queries

### Intent Routing & Classification

3. [router.md](#routermd) - Main intent classification and slot extraction
4. [router_fallback.md](#router_fallbackmd) - Fallback routing when primary routing fails
5. [router_llm.md](#router_llmmd) - LLM-based routing with enhanced slot parsing
6. [nlp_intent_detection.md](#nlp_intent_detectionmd) - Intent detection with confidence scoring
7. [intent_parser.md](#intent_parsermd) - Universal intent parsing with slot extraction

### Entity Extraction & Parsing

8. [city_parser.md](#city_parsermd) - City name extraction and normalization
9. [date_parser.md](#date_parsermd) - Date/time information extraction and normalization
10. [nlp_city_extraction.md](#nlp_city_extractionmd) - LLM-powered city name extraction
11. [nlp_clarifier.md](#nlp_clarifiermd) - Clarifying question generation for missing information

### Content Classification & Analysis

12. [nlp_content_classification.md](#nlp_content_classificationmd) - Comprehensive content type and constraint classification
13. [consent_detector.md](#consent_detectormd) - Yes/no consent detection from user responses
14. [query_type_detector.md](#query_type_detectormd) - Specialized query type detection (restaurant/budget/flight)
15. [complexity_assessor.md](#complexity_assessormd) - Travel query complexity assessment for deep research

### Response Generation & Synthesis

16. [blend.md](#blendmd) - Fact-to-response blending with citation management
17. [verify.md](#verifymd) - Answer verification and factual accuracy checking

### Web Search & Information Retrieval

18. [web_search_decider.md](#web_search_decidermd) - Decision logic for when to use web search vs APIs
19. [search_query_optimizer.md](#search_query_optimizermd) - Query optimization for web search engines
20. [search_summarize.md](#search_summarizemd) - Web search result summarization with citations
21. [search_extract_weather.md](#search_extract_weathermd) - Weather information extraction from search results
22. [search_extract_country.md](#search_extract_countrymd) - Country information extraction from search results
23. [search_extract_attractions.md](#search_extract_attractionsmd) - Attraction information extraction from search results

## Detailed Prompt Documentation

### Core System Prompts

#### system.md
**Purpose:** Defines the core identity, behavior guidelines, and operational boundaries for the travel assistant.
**Structure:**
- Core role and behavior rules
- Identity and professional boundaries
- Decision policy for tools and data usage
- Translation workflow for multilingual support
- Response format specifications
- Error handling and safety protocols
- Prompt injection protection
- Determinism requirements

**Usage:** Used as the base system prompt for all LLM interactions to ensure consistent behavior and safety.

#### cot.md
**Purpose:** Guides chain-of-thought reasoning for complex travel planning queries requiring multiple steps.
**Structure:**
- 5-step reasoning process: Analyze → Plan → Ask → Draft → Verify
- Confidence scoring at each step
- Slot extraction and validation
- Response format constraints

**Usage:** Applied to complex queries involving multiple constraints (budget, group composition, timing, etc.).

### Intent Routing & Classification

#### router.md
**Purpose:** Primary intent classification and slot extraction for travel queries.
**Structure:**
- Intent categories: weather, destinations, packing, attractions, unknown
- Slot extraction rules for city, month, dates, travelerProfile
- Confidence scoring and missing slot identification
- Hard rules for slot normalization and intent distinction

**Usage:** First-line intent routing in the router cascade, handles most standard travel queries.

#### router_fallback.md
**Purpose:** Backup routing mechanism when primary router fails or needs additional context.
**Structure:**
- Inherits from router.md but includes context slot integration
- Few-shot examples for edge cases
- Fallback guidelines for ambiguous queries

**Usage:** Called when router.md returns low confidence or when context slots need integration.

#### router_llm.md
**Purpose:** Enhanced LLM-based routing with advanced slot parsing and profile detection.
**Structure:**
- Comprehensive slot schema with travelerProfile support
- Entity normalization rules (NYC → New York City)
- External API decision logic
- Extensive few-shot examples for various query types

**Usage:** Used in router.llm.ts for complex queries requiring nuanced intent detection.

#### nlp_intent_detection.md
**Purpose:** Focused intent detection with confidence scoring and external API flags.
**Structure:**
- 5 intent categories with clear definitions
- Confidence ranges and thresholds
- needExternal flag for API requirements
- Slot extraction with context integration

**Usage:** Lightweight intent detection for quick classification decisions.

#### intent_parser.md
**Purpose:** Universal intent parsing with comprehensive slot extraction and multilingual support.
**Structure:**
- Intent definitions with examples
- Multilingual slot extraction rules
- Context integration for slot filling
- Confidence-based decision making

**Usage:** Used by parsers.ts for unified intent and slot parsing across the system.

### Entity Extraction & Parsing

#### city_parser.md
**Purpose:** Specialized city name extraction and normalization using Transformers + LLM fallback.
**Structure:**
- City extraction patterns for various languages
- Normalization rules for abbreviations (NYC → New York)
- Multilingual support (Russian, etc.)
- Confidence scoring based on extraction method

**Usage:** Called by parsers.ts for city entity extraction and validation.

#### date_parser.md
**Purpose:** Date and time information extraction with normalization.
**Structure:**
- Support for various date formats (ranges, months, seasons)
- Typo correction (Jnne → June)
- Multilingual month name support
- Confidence scoring based on format specificity

**Usage:** Used by parsers.ts for temporal entity extraction.

#### nlp_city_extraction.md
**Purpose:** LLM-powered city name extraction with fallback patterns.
**Structure:**
- Regex-based extraction patterns
- Abbreviation mapping
- Multilingual city name support
- Edge case handling (pronouns, missing cities)

**Usage:** Fallback city extraction when Transformers-based parsing fails.

#### nlp_clarifier.md
**Purpose:** Generates targeted clarifying questions for missing travel information.
**Structure:**
- Missing slot analysis
- Deterministic question generation based on slot combinations
- Test-aligned response patterns
- Context-aware question selection

**Usage:** Used by clarifier.ts to generate follow-up questions for incomplete queries.

#### iata_code_generator.md
**Purpose:** Converts city or airport names to their 3-letter IATA airport codes.
**Structure:**
- Clear output format specification (3-letter IATA code only)
- Disambiguation rules for cities with multiple airports
- Examples for common city/airport mappings
- Input/output format guidelines

**Usage:** Used by amadeus_flights.ts for converting city names to IATA codes in flight searches.

### Content Classification & Analysis

#### nlp_content_classification.md
**Purpose:** Comprehensive content type classification with constraint detection.
**Structure:**
- 10+ content types (travel, system, policy, restaurant, etc.)
- Constraint categories (budget, group, special, accommodation, transport, time, location)
- Explicit search detection
- Mixed language detection

**Usage:** Primary content classification used by llm.ts and blend.ts for query understanding.

#### consent_detector.md
**Purpose:** Binary consent detection from user responses to yes/no questions.
**Structure:**
- Positive response patterns
- Negative response patterns
- Unclear response handling
- Few-shot examples for edge cases

**Usage:** Used by graph.ts for consent detection in interactive flows.

#### query_type_detector.md
**Purpose:** Specialized detection for specific query types requiring web search.
**Structure:**
- 4 query types: restaurant, budget, flight, none
- Clear detection rules for each type
- Simple yes/no decision framework

**Usage:** Used by blend.ts to determine if web search is needed for specific query types.

#### complexity_assessor.md
**Purpose:** Assesses travel query complexity to determine if deep research is needed.
**Structure:**
- Constraint counting (budget, group, time, special needs)
- Complexity threshold (3+ constraints = complex)
- Confidence scoring for assessment
- Few-shot examples for various complexity levels

**Usage:** Used by deep_research.ts to decide research depth.

### Response Generation & Synthesis

#### blend.md
**Purpose:** Guides the blending of external facts with LLM-generated responses.
**Structure:**
- Fact-grounded response generation rules
- Citation management (when to cite, how to format)
- Error handling for missing facts
- Family-friendly content rules

**Usage:** Core response generation prompt used by blend.ts for all user-facing answers.

#### verify.md
**Purpose:** Answer verification to ensure factual accuracy and proper citation.
**Structure:**
- Verdict system: pass/warn/fail
- Confidence scoring for verification
- Citation validation rules
- Revised answer generation for failures

**Usage:** Used by verify.ts to validate response accuracy before delivery.

### Web Search & Information Retrieval

#### web_search_decider.md
**Purpose:** Determines when to use web search vs travel APIs based on query type.
**Structure:**
- Clear criteria for web search requirements
- Query type categorization
- Binary decision framework (yes/no)
- Examples for each category

**Usage:** Used by blend.ts to decide search strategy for different query types.

#### search_query_optimizer.md
**Purpose:** Optimizes user queries for effective web search engine results.
**Structure:**
- Length constraints (6-12 words)
- Keyword optimization rules
- Context integration (origin, time, budget)
- Search engine best practices

**Usage:** Used by llm.ts and search modules to improve search result quality.

#### search_summarize.md
**Purpose:** Summarizes web search results with inline citations.
**Structure:**
- Concise answer format (≤180 words)
- Bullet-point structure with citations
- Source attribution requirements
- Clarification question generation for insufficient results

**Usage:** Used by blend.ts for web search result synthesis.

#### search_extract_weather.md
**Purpose:** Extracts weather information from web search results.
**Structure:**
- JSON output format requirements
- Length constraints (≤25 words)
- Temperature/high-low preference
- Empty result handling

**Usage:** Used by tools/brave_search.ts for weather data extraction.

#### search_extract_country.md
**Purpose:** Extracts country information from web search results.
**Structure:**
- Focus on key facts (currency, language, capital)
- Length constraints (≤30 words)
- Factual accuracy requirements
- Missing information handling

**Usage:** Used by tools/brave_search.ts for country data extraction.

#### search_extract_attractions.md
**Purpose:** Extracts attraction information from web search results.
**Structure:**
- 2-4 notable attractions per city
- Source-based extraction (only from results)
- Concise summary format
- Empty result handling

**Usage:** Used by tools/brave_search.ts for attraction data extraction.

## Prompt Relationships & Architecture

### Cascade Architecture
The prompts follow a cascade architecture for robustness:

1. **Primary Classification**: `router.md` → `nlp_content_classification.md`
2. **Fallback Routing**: `router_fallback.md` → `router_llm.md`
3. **Entity Extraction**: `city_parser.md` → `nlp_city_extraction.md`
4. **Response Generation**: `blend.md` → `search_summarize.md`

### Integration Points
- **Core Modules**: All prompts are loaded by `prompts.ts` and used throughout the core modules
- **LLM Interface**: `llm.ts` uses multiple prompts for different specialized tasks
- **Parser Integration**: `parsers.ts` uses entity extraction prompts
- **Response Pipeline**: `blend.ts` orchestrates multiple prompts for response generation

### Prompt Categories by Usage Pattern

**Classification Prompts:**
- router.md, router_fallback.md, router_llm.md
- nlp_intent_detection.md, intent_parser.md
- nlp_content_classification.md

**Extraction Prompts:**
- city_parser.md, date_parser.md
- nlp_city_extraction.md
- search_extract_*.md

**Generation Prompts:**
- blend.md, search_summarize.md
- nlp_clarifier.md

**Decision Prompts:**
- web_search_decider.md
- query_type_detector.md
- complexity_assessor.md
- consent_detector.md

**Verification Prompts:**
- verify.md

**Optimization Prompts:**
- search_query_optimizer.md

## Development Guidelines

### Adding New Prompts
1. Follow the established naming convention: `{domain}_{function}.md`
2. Include comprehensive examples and edge cases
3. Specify exact output format requirements
4. Document confidence scoring when applicable
5. Add to PROMPTS.md documentation

### Testing Prompts
- Test with various input variations
- Verify output format compliance
- Check confidence score ranges
- Validate edge case handling
- Ensure consistency with existing prompt patterns

### Maintenance
- Keep examples current and comprehensive
- Update constraints as requirements evolve
- Maintain consistency across related prompts
- Document any breaking changes to output formats
