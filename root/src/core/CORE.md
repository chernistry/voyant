# Core Modules Documentation

This document provides a detailed overview of each module in the `/src/core` directory, explaining what it does, where it's used, and whether it uses Transformers or LLM approaches.

## Module Index

### Active Modules (Using Transformers)

1. [ner.ts](#nerts) - Unified NER facade using Transformers with local/remote fallback
2. [ner-enhanced.ts](#ner-enhancedts) - Enhanced NER with business logic and pattern-based detection using Transformers
3. [transformers-classifier.ts](#transformers-classifierts) - Content and intent classification using Transformers with rule-based fallbacks
4. [transformers-detector.ts](#transformers-detectorts) - Language and script detection using Transformers
5. [transformers-env.ts](#transformers-envts) - Transformers.js environment configuration for offline mode
6. [transformers-nlp-facade.ts](#transformers-nlp-facadets) - Unified NLP processing facade coordinating multiple Transformers models
7. [transformers-attractions-classifier.ts](#transformers-attractions-classifierts) - Attraction classification using Transformers with LLM fallback for family-friendly filtering
8. [transformers-consent-classifier.ts](#transformers-consent-classifierts) - Consent classification using Transformers with high-confidence thresholds
9. [ner-ipc.ts](#ner-ipcts) - IPC for running Transformers in child processes to avoid Jest/ORT typed array issues

### Active Modules (Using LLM)

10. [llm.ts](#llmts) - Unified LLM interface with model fallback chain and circuit breaker protection
11. [router.llm.ts](#routerllmts) - LLM-based routing with universal parser integration
12. [clarifier.ts](#clarifierts) - LLM-based clarifying question generation with deterministic fallback
13. [deep_research.ts](#deep_researchts) - LLM-powered deep research with web crawling and multi-pass synthesis
14. [blend.planner.ts](#blendplannerts) - LLM-based planning for blend operations and query strategy determination

### Active Modules (Hybrid - Using Both Transformers and LLM)

15. [blend.ts](#blendts) - Orchestrates blending of external API facts with LLM responses and handles chat interactions
16. [graph.ts](#graphts) - Core decision graph/state machine with AI-first consent detection and slot management
17. [nlp.ts](#nlpts) - General NLP utilities with LLM classification and Transformers detection
18. [parsers.ts](#parsersts) - Universal parsing functions using AI-first approaches with Transformers NER and LLM fallback
19. [policy_agent.ts](#policy_agentts) - Policy-related query handling with LLM reasoning
20. [preference-extractor.ts](#preference-extractorts) - Travel preference extraction using AI techniques
21. [router.ts](#routerts) - Main intent router with cascade of techniques (Transformers → LLM → rules)
22. [search-query-optimizer.ts](#search-query-optimizerts) - Search query optimization with LLM enhancement and caching
23. [search-result-extractor.ts](#search-result-extractorts) - Web search result extraction and summarization
24. [searchSummarizer.ts](#searchsummarizerts) - Search result summarization with LLM and deterministic fallback
25. [graph.optimizers.ts](#graphoptimizersts) - Graph processing optimization helpers and G-E-R-A pattern implementation

### Active Modules (Utility)

26. [circuit-breaker.ts](#circuit-breakerts) - Circuit breaker pattern implementation for external API resilience
27. [citations.ts](#citationsts) - Citation management and verification to prevent fabricated sources
28. [memory.ts](#memoryts) - Conversation memory management with message history and thread isolation
29. [prompts.ts](#promptsts) - Prompt template management with lazy loading and caching
30. [rate-limiter.ts](#rate-limiterts) - Rate limiting implementation for API and CLI commands
31. [receipts.ts](#receiptsts) - Fact tracking and receipts for transparency and verification
32. [slot_memory.ts](#slot_memoryts) - Slot memory for context retention across conversation turns
33. [verify.ts](#verifyts) - Answer verification using LLM to ensure factual accuracy
34. [composers.ts](#composersts) - Deterministic response composition utilities
35. [constraintGraph.ts](#constraintgraphts) - Constraint graph management for complexity assessment
36. [router.optimizers.ts](#routeroptimizersts) - Router optimization utilities and heuristics


## Module Details

### Active Modules (Using Transformers)

#### ner.ts
**What it does:** Provides a unified NER facade with intelligent strategy selection (local/remote/auto) using Transformers.js. Supports multiple model configurations, automatic fallback mechanisms, and IPC for test environments. Handles entity extraction with confidence scoring and timeout management.
**Where used:** Used by `ner-enhanced.ts`, `transformers-nlp-facade.ts`, `parsers.ts`, and other modules requiring named entity recognition.
**Technology:** Transformers
**Relationship:** This is the foundational module that `ner-enhanced.ts` extends with business logic and pattern-based detection.

#### ner-enhanced.ts
**What it does:** Provides enhanced named entity recognition with improved entity extraction and scoring using Transformers. This module adds business logic, enhanced categorization, and pattern-based detection on top of the basic NER functionality.
**Where used:** Used by `graph.ts`, `router.ts`, and other modules requiring advanced NER capabilities with categorized entities.
**Technology:** Transformers
**Relationship:** This module imports and extends `ner.ts` to provide enhanced functionality.

#### transformers-classifier.ts
**What it does:** Provides content and intent classification using transformer models.
**Where used:** Used by various modules requiring content/intent classification.
**Technology:** Transformers

#### transformers-detector.ts
**What it does:** Detects languages and script types in text using transformer models.
**Where used:** Used by `nlp.ts` and other modules requiring language detection.
**Technology:** Transformers

#### transformers-env.ts
**What it does:** Configures the Transformers.js environment for proper model loading and execution.
**Where used:** Imported by `ner.ts` and other modules using Transformers.js.
**Technology:** Transformers

#### transformers-nlp-facade.ts
**What it does:** Provides a facade for unified NLP processing using transformers.
**Where used:** Used by `graph.ts` for NLP processing.
**Technology:** Transformers

#### transformers-attractions-classifier.ts
**What it does:** Classifies attractions using Transformers for content analysis, with LLM fallback for family-friendly filtering. Implements kid-friendly attraction detection using both NLP patterns and LLM reasoning.
**Where used:** Used by `tools/attractions.ts` for filtering attractions based on family-friendly criteria.
**Technology:** Transformers (primary), LLM (fallback)

#### transformers-consent-classifier.ts
**What it does:** Classifies user consent responses using NLP (Transformers) techniques.
**Where used:** Used by `graph.ts` for consent detection.
**Technology:** Transformers

#### ner-ipc.ts
**What it does:** Implements IPC (Inter-Process Communication) for running NER models in child processes to avoid Jest/ORT typed array issues.
**Where used:** Used by `ner.ts` in test environments.
**Technology:** Transformers

### Active Modules (Using LLM)

#### llm.ts
**What it does:** Provides a unified interface for calling LLMs with model fallback chain, circuit breaker protection, and response format handling. Includes specialized functions for city extraction, clarifying questions, intent classification, and content classification.
**Where used:** Used throughout the core modules for LLM interactions and specialized NLP tasks.
**Technology:** LLM

#### router.llm.ts
**What it does:** Implements LLM-based routing for determining user intents and extracting slots.
**Where used:** Used by `router.ts` as a fallback routing mechanism.
**Technology:** LLM

#### clarifier.ts
**What it does:** Builds clarifying questions when information is missing from user queries, using both LLM and fallback logic.
**Where used:** Used by `graph.ts` to ask users for missing information.
**Technology:** LLM

#### deep_research.ts
**What it does:** Implements deep research capabilities using web crawling and advanced search techniques for complex queries.
**Where used:** Used by `blend.ts` when deep research is required.
**Technology:** LLM

#### blend.planner.ts
**What it does:** Provides LLM-based planning for blend operations, determining query facets, safety checks, and response strategies. Analyzes user messages to decide on web search needs, language handling, missing slots, and response formatting.
**Where used:** Used by `blend.ts` to plan how to handle user queries and determine what external APIs or web searches are needed.
**Technology:** LLM

### Active Modules (Hybrid - Using Both Transformers and LLM)

#### blend.ts
**What it does:** Orchestrates the blending of facts from external APIs with LLM-generated responses. Handles complex chat interactions, web searches, fact verification, consent detection, and query type classification. Implements sophisticated safety guardrails and mixed-language support.
**Where used:** Used by `graph.ts` and `cli.ts` as the main response generation engine for user queries.
**Technology:** Both Transformers and LLM

#### graph.ts
**What it does:** Implements the core decision graph/state machine that processes user intents and routes them to appropriate handlers. Includes AI-first consent detection, city validation with geocoding, search query sanitization, and complex slot management.
**Where used:** Central module used by `cli.ts` and `api/server.ts` for processing user requests and managing conversation state.
**Technology:** Both Transformers and LLM

#### nlp.ts
**What it does:** Provides general NLP utilities and functions for content classification and language detection.
**Where used:** Used by various modules requiring NLP capabilities.
**Technology:** Both Transformers and LLM

#### parsers.ts
**What it does:** Provides universal parsing functions for extracting cities, dates, intents, and slots from text using AI-first approaches. Implements Transformers NER with LLM fallback, confidence scoring, and schema validation.
**Where used:** Used by `router.ts`, `router.llm.ts`, and other modules requiring entity extraction and slot filling.
**Technology:** Both Transformers and LLM

#### policy_agent.ts
**What it does:** Handles policy-related queries and routing.
**Where used:** Used by `graph.ts` for policy-related intent handling.
**Technology:** Both Transformers and LLM

#### preference-extractor.ts
**What it does:** Extracts user travel preferences from text using AI techniques.
**Where used:** Used by `graph.ts` for preference extraction.
**Technology:** Both Transformers and LLM

#### router.ts
**What it does:** Main router that determines user intents and routes them to appropriate handlers using a cascade of techniques.
**Where used:** Used by `graph.ts` for intent routing.
**Technology:** Both Transformers and LLM

#### search-query-optimizer.ts
**What it does:** Optimizes search queries for better web search results.
**Where used:** Used by `blend.ts` and other modules requiring search optimization.
**Technology:** Both Transformers and LLM

#### search-result-extractor.ts
**What it does:** Extracts relevant information from web search results.
**Where used:** Used by `blend.ts` for processing search results.
**Technology:** Both Transformers and LLM

#### searchSummarizer.ts
**What it does:** Summarizes web search results using LLM with deterministic fallback for concise, well-formatted responses. Handles HTML sanitization, response truncation, and citation formatting.
**Where used:** Used by `blend.ts` and `graph.ts` for formatting search results into readable responses.
**Technology:** Both Transformers and LLM

#### graph.optimizers.ts
**What it does:** Provides optimization helpers for the graph processing pipeline including guards, cache management, and decision table logic. Implements G-E-R-A pattern (Guard → Extract → Route → Act) with regex patterns and fast-path routing.
**Where used:** Used by `graph.ts` for efficient request processing and fast-path routing.
**Technology:** Both Transformers and LLM

### Active Modules (Utility)

#### circuit-breaker.ts
**What it does:** Implements the circuit breaker pattern for resilience in external API calls. Prevents cascading failures when services are down.
**Where used:** Used by various tools that make external API calls, such as `search.ts`.
**Technology:** Utility

#### citations.ts
**What it does:** Manages citations and verifies that responses don't fabricate information without proper sources.
**Where used:** Used by `blend.ts` and other modules that generate responses requiring citations.
**Technology:** Utility

#### memory.ts
**What it does:** Manages conversation memory and message history for chat interactions.
**Where used:** Used by `blend.ts` and `cli.ts` for maintaining conversation context.
**Technology:** Utility

#### prompts.ts
**What it does:** Manages prompt templates for various LLM interactions.
**Where used:** Used by `llm.ts` and other modules requiring prompt templates.
**Technology:** Utility

#### rate-limiter.ts
**What it does:** Implements rate limiting for API and CLI commands to prevent abuse.
**Where used:** Used by `cli.ts` and `api/server.ts`.
**Technology:** Utility

#### receipts.ts
**What it does:** Manages receipts/facts tracking for transparency and verification of information sources.
**Where used:** Used by `blend.ts` and other modules generating responses with external facts.
**Technology:** Utility

#### slot_memory.ts
**What it does:** Manages slot memory for retaining context across conversation turns.
**Where used:** Used by `graph.ts` and other modules requiring context retention.
**Technology:** Utility

#### verify.ts
**What it does:** Implements answer verification to ensure responses are factual and properly cited.
**Where used:** Used by `blend.ts` for response verification.
**Technology:** Utility

#### composers.ts
**What it does:** Provides deterministic response composition utilities for weather, packing, and attractions replies.
**Where used:** Used by `blend.ts` and `graph.ts` for consistent, formatted response generation.
**Technology:** Utility

#### constraintGraph.ts
**What it does:** Builds and manages constraint graphs for assessing query complexity and routing decisions.
**Where used:** Used by `graph.ts` and `router.ts` for determining processing complexity and optimization strategies.
**Technology:** Utility

#### router.optimizers.ts
**What it does:** Provides router optimization utilities including regex patterns, guards, and heuristics for efficient routing decisions.
**Where used:** Used by `router.ts` for fast-path routing and complexity assessment.
**Technology:** Utility
