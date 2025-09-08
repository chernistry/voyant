# CORE NLP MODULES - Complete Catalog

### Architectural Principles:
- **LLM-first approach** with NER fallback strategies
- **Multilingual support** (EN/RU/auto-detect)
- **Flexible configuration** via environment variables
- **IPC isolation** for test environment
- **Multi-level fallbacks** (Transformers.js ↔ HF API)

---

## 🎯 NLP FUNCTIONALITY CATEGORIES

### 1. 🔍 NER & ENTITY EXTRACTION (15 files)
**Purpose:** Extract named entities from text (LOC, PER, ORG, MISC)

#### Main files:
- `src/core/ner.ts` - **Main NER facade**, unified implementation with auto-fallback
- `src/core/ner-enhanced.ts` - Enhanced NER with additional processing
- `src/core/ner-ipc.ts` - IPC worker for isolation in test environment
- `src/tools/ner.ts` - NER tool for external calls
- `scripts/ner-worker.ts` - Separate worker for NER processing

#### Transformers-based:
- `src/core/transformers-nlp.ts` - **DEPRECATED**, use `ner.ts`
- `src/core/transformers-nlp-facade.ts` - Facade for transformers functionality
- `src/core/transformers-detector.ts` - Detector based on transformers
- `src/core/transformers-classifier.ts` - Classifier based on transformers

#### Compiled versions:
- `dist/core/ner.js`, `dist/core/ner-enhanced.js`, `dist/core/ner-ipc.js`
- `dist/core/transformers-nlp.js`, `dist/core/transformers-nlp-facade.js`
- `dist/tools/ner.js`

### 2. 🧠 INTENT DETECTION & CLASSIFICATION (12 files)
**Purpose:** Determine user intent and route requests

#### Core files:
- `src/core/nlp.ts` - **Main NLP orchestrator** (intent detection, slot extraction)
- `src/core/router.ts` - Request router
- `src/core/router.llm.ts` - LLM-based routing
- `src/core/classifier.ts` - General content classifier

#### Intent parsing:
- `src/prompts/intent_parser.md` - Prompt for intent detection
- `src/prompts/nlp_intent_detection.md` - Prompt for NLP intent detection
- `src/core/parsers.ts` - Parsers for different data types

#### Compiled versions:
- `dist/core/nlp.js`, `dist/core/router.js`, `dist/core/router.llm.js`
- `dist/prompts/intent_parser.md`, `dist/prompts/nlp_intent_detection.md`

### 3. 🔤 TEXT PARSING & EXTRACTION (18 files)
**Purpose:** Parse text for structured data extraction

#### Parsers:
- `src/core/parsers.ts` - **Universal parser** (city, date, intent, slots)
- `src/core/city_cleaner.ts` - City name cleaning and normalization
- `src/core/slot_memory.ts` - Slot memory management

#### Specialized parsers:
- `src/prompts/city_parser.md` - Prompt for city parsing
- `src/prompts/date_parser.md` - Prompt for date parsing
- `src/prompts/search_extract_country.md` - Country extraction
- `src/prompts/search_extract_weather.md` - Weather extraction
- `src/prompts/search_extract_attractions.md` - Attractions extraction

#### Compiled versions:
- `dist/core/parsers.js`, `dist/core/city_cleaner.js`, `dist/core/slot_memory.js`
- `dist/prompts/city_parser.md`, `dist/prompts/date_parser.md`

### 4. 📝 CONTENT CLASSIFICATION (8 files)
**Purpose:** Classify content type and relevance

#### Main files:
- `src/prompts/nlp_content_classification.md` - Prompt for content classification
- `src/core/llm.ts` - LLM with `classifyContent` function
- `src/core/clarifier.ts` - Clarifying questions generation

#### Content types:
- `system`, `travel`, `unrelated`, `budget`, `restaurant`, `flight`, `gibberish`, `emoji_only`

#### Compiled versions:
- `dist/prompts/nlp_content_classification.md`
- `dist/core/llm.js`, `dist/core/clarifier.js`

### 5. 🎭 LANGUAGE DETECTION & MULTILINGUAL (3 files)
**Purpose:** Language detection and multilingual support

#### Main files:
- `src/types/langdetect.d.ts` - TypeScript types for langdetect
- `node_modules/langdetect/` - Language detection library
- `src/util/noise_filter.ts` - Text noise filtering

### 6. 🤖 LLM INTEGRATION & PROMPTS (23 files)
**Purpose:** LLM integration and prompt management

#### Core LLM files:
- `src/core/llm.ts` - **Main LLM interface** with classification functions
- `src/core/prompts.ts` - Prompt management
- `src/prompts/system.md` - System prompt

#### Specialized prompts:
- `src/prompts/router.md` - Routing
- `src/prompts/router_llm.md` - LLM routing
- `src/prompts/router_fallback.md` - Fallback routing
- `src/prompts/blend.md` - Context blending
- `src/prompts/nlp_clarifier.md` - Clarifying questions
- `src/prompts/search_query_optimizer.md` - Search query optimization
- `src/prompts/search_summarize.md` - Search results summarization
- `src/prompts/web_search_decider.md` - Web search decision
- `src/prompts/cot.md` - Chain of Thought prompt

#### Compiled versions:
- `dist/core/llm.js`, `dist/core/prompts.js`
- `dist/prompts/*.md` (all 23 files)

### 7. 🛠 TOOLS & EXTERNAL INTEGRATIONS (11 files)
**Purpose:** Tools for working with external services

#### NLP-related tools:
- `src/tools/brave_search.ts` - Brave search (NLP result processing)
- `src/tools/brave_suggest.ts` - Search suggestions
- `src/tools/crawlee_research.ts` - Research using Crawlee
- `src/tools/country.ts` - Country processing (NLP)
- `src/tools/weather.ts` - Weather processing (NLP)
- `src/tools/attractions.ts` - Attractions processing (NLP)

#### Compiled versions:
- `dist/tools/brave_search.js`, `dist/tools/brave_suggest.js`
- `dist/tools/crawlee_research.js`, `dist/tools/country.js`
- `dist/tools/weather.js`, `dist/tools/attractions.js`

### 8. 🧪 TESTS (30 files)
**Purpose:** Testing NLP functionality

#### Unit tests:
- `tests/unit/transformers-nlp.test.ts` - Transformers testing
- `tests/unit/content.classification.test.ts` - Content classification
- `tests/unit/ner.facade.test.ts` - NER facade
- `tests/integration/ner.integration.test.ts` - NER integration tests
- `tests/unit/nlp_wrappers.test.ts` - NLP wrappers
- `tests/unit/parsers-nlp-first.test.ts` - Parsers with NLP priority

#### E2E tests:
- `tests/e2e/02-attractions_variants.test.ts` - Attractions variants
- `tests/e2e/03-intent_family_thread.test.ts` - Intent family
- `tests/e2e/07-conflicting_abrupt_sensitive_multilang_metrics.test.ts` - Multilingual metrics

#### Integration tests:
- `tests/integration/nlp-pipeline.test.ts` - NLP pipeline

### 9. ⚙️ UTILITY & INFRASTRUCTURE (7 files)
**Purpose:** Helper functions and infrastructure

#### Utils:
- `src/util/noise_filter.ts` - Noise filtering
- `src/util/metrics.ts` - Performance metrics
- `src/util/circuit.ts` - Circuit breaker pattern
- `src/util/fetch.ts` - HTTP requests with NLP processing

#### Schemas:
- `src/schemas/router.ts` - Routing schemas
- `src/schemas/chat.ts` - Chat schemas

---

## 🔧 CONFIGURATION & ENVIRONMENT VARIABLES

### NER Configuration:
```bash
NER_MODE=local|remote|auto          # NER operation mode
TRANSFORMERS_NER_MODEL=...          # Model for transformers
HF_TOKEN=...                        # HuggingFace token
NER_USE_LOCAL=true|false            # DEPRECATED, use NER_MODE
```

### Language Detection:
```bash
LOG_LEVEL=debug|info|warn|error      # Logging level
NODE_ENV=test|development|production # Environment
```

### Timeout Settings:
```bash
DEFAULT_TIMEOUT_MS=2000              # Default timeout
REMOTE_TIMEOUT_MS=5000               # Remote API timeout
```

---

## 📈 ARCHITECTURAL PATTERNS

### 1. **LLM-First with Smart Fallbacks**
```
User Input → LLM Intent Detection → Slot Extraction → NER Validation
                              ↓
                       Transformers NER → HF API Fallback
```

### 2. **Multi-Level Parsing**
```
Raw Text → Intent Parser → City Parser → Date Parser → Slot Memory
```

### 3. **Content Classification Pipeline**
```
Input → Language Detection → Content Type Classification → Route Decision
```

### 4. **Error Handling & Resilience**
```
Try Local → Timeout → IPC Worker → Remote API → Graceful Degradation
```

---

## 🎯 KEY FUNCTIONS

### Intent Types:
- `weather` - weather queries
- `packing` - travel packing queries
- `attractions` - attractions
- `destinations` - travel destinations
- `web_search` - general web searches
- `system` - system commands
- `unknown` - unrecognized queries

### Entity Types (NER):
- `LOC` - locations (cities, countries)
- `PER` - persons
- `ORG` - organizations
- `MISC` - miscellaneous

### Content Types:
- `system`, `travel`, `unrelated`, `budget`, `restaurant`, `flight`, `gibberish`, `emoji_only`

---

## 📋 COMPLETE LIST OF ALL NLP FILES BY CATEGORY

### Source Files (TypeScript):
1. `src/core/ner.ts` - Main NER facade
2. `src/core/ner-enhanced.ts` - Enhanced NER
3. `src/core/ner-ipc.ts` - IPC worker for NER
4. `src/core/transformers-nlp.ts` - Transformers NER (deprecated)
5. `src/core/transformers-nlp-facade.ts` - Transformers facade
6. `src/core/transformers-detector.ts` - Transformers detector
7. `src/core/transformers-classifier.ts` - Transformers classifier
8. `src/core/nlp.ts` - Main NLP orchestrator
9. `src/core/parsers.ts` - Universal parser
10. `src/core/router.ts` - Router
11. `src/core/router.llm.ts` - LLM router
12. `src/core/city_cleaner.ts` - City cleaner
13. `src/core/slot_memory.ts` - Slot management
14. `src/core/clarifier.ts` - Clarification generator
15. `src/core/llm.ts` - LLM interface
16. `src/core/prompts.ts` - Prompt management
17. `src/tools/ner.ts` - NER tool
18. `src/tools/brave_search.ts` - Search with NLP
19. `src/tools/brave_suggest.ts` - Search suggestions
20. `src/tools/crawlee_research.ts` - Research with NLP
21. `src/tools/country.ts` - Country processing
22. `src/tools/weather.ts` - Weather processing
23. `src/tools/attractions.ts` - Attractions processing
24. `src/types/langdetect.d.ts` - Langdetect types
25. `src/util/noise_filter.ts` - Noise filter
26. `src/util/metrics.ts` - Metrics
27. `src/util/circuit.ts` - Circuit breaker
28. `src/util/fetch.ts` - HTTP with NLP
29. `src/schemas/router.ts` - Routing schemas
30. `src/schemas/chat.ts` - Chat schemas
31. `scripts/ner-worker.ts` - NER worker

### Prompt Templates (Markdown):
32. `src/prompts/intent_parser.md`
33. `src/prompts/nlp_intent_detection.md`
34. `src/prompts/nlp_content_classification.md`
35. `src/prompts/city_parser.md`
36. `src/prompts/date_parser.md`
37. `src/prompts/search_extract_country.md`
38. `src/prompts/search_extract_weather.md`
39. `src/prompts/search_extract_attractions.md`
40. `src/prompts/router.md`
41. `src/prompts/router_llm.md`
42. `src/prompts/router_fallback.md`
43. `src/prompts/blend.md`
44. `src/prompts/nlp_clarifier.md`
45. `src/prompts/search_query_optimizer.md`
46. `src/prompts/search_summarize.md`
47. `src/prompts/web_search_decider.md`
48. `src/prompts/cot.md`
49. `src/prompts/system.md`
50. `src/prompts/complexity_assessor.md`

### Compiled Files (JavaScript):
51. `dist/core/ner.js`
52. `dist/core/ner-enhanced.js`
53. `dist/core/ner-ipc.js`
54. `dist/core/transformers-nlp.js`
55. `dist/core/transformers-nlp-facade.js`
56. `dist/core/transformers-detector.js`
57. `dist/core/transformers-classifier.js`
58. `dist/core/nlp.js`
59. `dist/core/parsers.js`
60. `dist/core/router.js`
61. `dist/core/router.llm.js`
62. `dist/core/city_cleaner.js`
63. `dist/core/slot_memory.js`
64. `dist/core/clarifier.js`
65. `dist/core/llm.js`
66. `dist/core/prompts.js`
67. `dist/tools/ner.js`
68. `dist/tools/brave_search.js`
69. `dist/tools/brave_suggest.js`
70. `dist/tools/crawlee_research.js`
71. `dist/tools/country.js`
72. `dist/tools/weather.js`
73. `dist/tools/attractions.js`
74. `dist/util/noise_filter.js`
75. `dist/util/metrics.js`
76. `dist/util/circuit.js`
77. `dist/util/fetch.js`
78. `dist/schemas/router.js`
79. `dist/schemas/chat.js`
80. `dist/prompts/*.md` (23 files)

### Test Files:
81. `tests/unit/transformers-nlp.test.ts`
82. `tests/unit/content.classification.test.ts`
83. `tests/unit/ner.facade.test.ts`
84. `tests/integration/ner.integration.test.ts`
85. `tests/unit/nlp_wrappers.test.ts`
86. `tests/unit/parsers-nlp-first.test.ts`
87. `tests/e2e/02-attractions_variants.test.ts`
88. `tests/e2e/03-intent_family_thread.test.ts`
89. `tests/e2e/07-conflicting_abrupt_sensitive_multilang_metrics.test.ts`
90. `tests/integration/nlp-pipeline.test.ts`

---

## 🚀 MAIN ENTRY POINTS

### Main functions:
- `detectIntentAndSlots()` - Intent and slot detection
- `extractEntities()` - Entity extraction via NER
- `parseCity()`, `parseDate()`, `parseIntent()` - Specialized parsers
- `classifyContent()` - Content classification
- `clarifierLLM()` - Clarifying questions generation

### Models and configuration:
- **Local Models**: `Xenova/bert-base-multilingual-cased-ner-hrl`
- **Remote Models**: `Davlan/xlm-roberta-base-ner-hrl`
- **Language Detection**: `langdetect` library
- **LLM Integration**: OpenAI/HuggingFace API

