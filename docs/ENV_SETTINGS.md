# ENVIRONMENT VARIABLES SETTINGS

This document explains every environment variable used in the Navan Travel Assistant, including their purpose, usage, and implementation details.

---

## 🔧 CORE CONFIGURATION

### `PORT`
**Default:** `3000`
**Purpose:** HTTP server port for the API
**Implementation:**
```typescript
// src/api/server.ts:43
const port = Number(process.env.PORT ?? 3000);
```
**Usage:** Controls which port the Express server listens on. Used for both development and production deployments.

### `LOG_LEVEL`
**Default:** `info` (when not specified)
**Options:** `silent | debug | info | warn | error`
**Purpose:** Controls logging verbosity and PII redaction
**Implementation:**
```typescript
// src/util/logging.ts:8
const level = process.env.LOG_LEVEL ?? 'info';

// src/util/redact.ts:3
// Redaction is disabled when LOG_LEVEL=debug to aid local debugging.

// src/core/ner.ts:64
// Suppresses transformers.js console output if LOG_LEVEL is info or higher
const shouldSuppressConsole = ['info', 'warn', 'error'].includes(process.env.LOG_LEVEL || '');
```
**Usage:**
- `debug`: Most verbose, includes PII for local debugging
- `info`: Standard operational logging
- `warn/error`: Only warnings and errors
- `silent`: No logs (used in tests)

### `METRICS`
**Default:** (not set)
**Options:** `off | json | prom`
**Purpose:** Controls metrics collection and exposure
**Implementation:**
```typescript
// src/util/metrics.ts:16
const MODE = (process.env.METRICS ?? '').toLowerCase();

// Lightweight JSON aggregation for external requests (works even when METRICS=off)
```
**Usage:**
- `off`: No metrics collection
- `json`: JSON endpoint at `/metrics` for lightweight monitoring
- `prom`: Prometheus integration for production monitoring

---

## 🤖 LLM CONFIGURATION

### `LLM_PROVIDER_BASEURL`
**Default:** `https://openrouter.ai/api/v1`
**Purpose:** Base URL for primary LLM API
**Implementation:**
```typescript
// src/core/llm.ts:51
const baseUrl = process.env.LLM_PROVIDER_BASEURL;
```
**Usage:**
- Primary endpoint for all LLM calls
- Can be set to local Ollama: `http://localhost:11434/v1`
- Supports OpenRouter, OpenAI-compatible APIs

### `LLM_API_KEY`
**Purpose:** API key for primary LLM provider
**Implementation:**
```typescript
// src/core/llm.ts:52
const apiKey = process.env.LLM_API_KEY;
```
**Security:** Never commit to version control. Used for authentication with LLM provider.

### `LLM_MODEL`
**Default:** `google/gemma-3n-e4b-it`
**Purpose:** Primary model for all LLM operations
**Implementation:**
```typescript
// src/core/llm.ts:53
const preferredModel = process.env.LLM_MODEL ?? models[0];
```
**Usage:** The main LLM model used for intent classification, content generation, and reasoning tasks.

### `LLM_MODELS`
**Default:** `mistralai/mistral-nemo,tngtech/deepseek-r1t2-chimera:free,meta-llama/llama-3.2-3b-instruct:free,microsoft/phi-3-mini-128k-instruct:free`
**Purpose:** Fallback model chain for LLM operations
**Implementation:**
```typescript
// src/core/llm.ts:48
const models = process.env.LLM_MODELS?.split(',').map(m => m.trim()) || defaultModels;
```
**Usage:** Comma-separated list of models to try in order if primary model fails. Enables graceful degradation.

### `LLM_TEST_EVALUATION_MODEL_BASEURL`
**Default:** `https://openrouter.ai/api/v1`
**Purpose:** Base URL for test evaluation LLM
**Implementation:**
```typescript
// src/test/llm-evaluator.ts:35
const baseUrl = process.env.LLM_TEST_EVALUATION_MODEL_BASEURL;
```

### `LLM_TEST_EVALUATION_MODEL`
**Default:** `deepseek/deepseek-chat-v3.1:free`
**Purpose:** Model used for evaluating test results
**Implementation:**
```typescript
// src/test/llm-evaluator.ts:37
const model = process.env.LLM_TEST_EVALUATION_MODEL;
```

### `LLM_TEST_EVALUATION_MODEL_API_KEY`
**Purpose:** API key for test evaluation LLM
**Security:** Never commit to version control.

---

## 🧠 NLP & AI MODELS

### `TRANSFORMERS_NER_MODEL`
**Default:** `Davlan/xlm-roberta-base-ner-hrl`
**Purpose:** Named Entity Recognition model selection
**Implementation:**
```typescript
// src/core/ner.ts:29
if (process.env.TRANSFORMERS_NER_MODEL) {
  return process.env.TRANSFORMERS_NER_MODEL;
}

// src/core/transformers-nlp.ts:14
return process.env.TRANSFORMERS_NER_MODEL || 'Davlan/xlm-roberta-base-ner-hrl';
```
**Usage:** Overrides default NER model. Can specify different models for local vs remote inference.

### `NER_USE_LOCAL`
**Default:** `true`
**Options:** `true | false`
**Purpose:** Force local NER processing
**Implementation:**
```typescript
// src/core/ner.ts:47
// Backward compatibility: check legacy NER_USE_LOCAL flag
if (process.env.NER_USE_LOCAL === 'true') return true;
```
**Usage:** When `true`, forces local Transformers.js models instead of remote API calls.

### `HF_TOKEN`
**Purpose:** HuggingFace API token for model downloads
**Implementation:**
```typescript
// src/core/ner.ts:129
if (process.env.HF_TOKEN) {
  headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;
}
```
**Usage:** Required for downloading models from HuggingFace when using remote inference.

### `TRANSFORMERS_NER_MODEL_LOCAL`
**Default:** `Xenova/bert-base-multilingual-cased-ner-hrl`
**Purpose:** Local NER model for Transformers.js
**Implementation:** Used by the NER system when `NER_USE_LOCAL=true`

### `TRANSFORMERS_NER_MODEL_REMOTE`
**Default:** `Davlan/xlm-roberta-base-ner-hrl`
**Purpose:** Remote NER model for HuggingFace Inference API
**Implementation:** Used by the NER system when making remote API calls

### `TRANSFORMERS_CLASSIFICATION_MODEL_LOCAL`
**Default:** `Xenova/nli-deberta-v3-base`
**Purpose:** Local model for content/intent classification
**Implementation:** Used by transformers-classifier.ts for local inference

### `TRANSFORMERS_CLASSIFICATION_MODEL_REMOTE`
**Default:** `facebook/bart-large-mnli`
**Purpose:** Remote model for content/intent classification
**Implementation:** Used by transformers-classifier.ts for remote API calls

### `TRANSFORMERS_ROUTER_TIMEOUT_MS`
**Default:** `3000` (increased from 2000)
**Purpose:** Timeout for Transformers.js operations in router
**Implementation:**
```typescript
// src/core/router.ts:495
const timeoutMs = Math.max(100, Number(process.env.TRANSFORMERS_ROUTER_TIMEOUT_MS ?? '3000'));
```
**Usage:** Prevents hanging on slow Transformers.js operations. Minimum 100ms, maximum configurable.

---

## 🌐 EXTERNAL SERVICES

### `BRAVE_SEARCH_API_KEY`
**Purpose:** API key for Brave Search service
**Implementation:**
```typescript
// src/tools/brave_search.ts:23
const apiKey = process.env.BRAVE_SEARCH_API_KEY;
```
**Usage:** Required for web search functionality and deep research features.

### `TAVILY_API_KEY`
**Purpose:** API key for Tavily Search service
**Implementation:**
```typescript
// src/tools/tavily_search.ts:21
const apiKey = process.env.TAVILY_API_KEY;
```
**Usage:** Required when `SEARCH_PROVIDER=tavily`.

### `SEARCH_PROVIDER`
**Default:** `brave`
**Options:** `brave | tavily`
**Purpose:** Selects the web search provider
**Implementation:**
```typescript
// src/tools/search.ts:13
return (process.env.SEARCH_PROVIDER || 'brave').toLowerCase();
```
**Usage:** Set to `tavily` to use Tavily; defaults to Brave.

### `OPENTRIPMAP_API_KEY`
**Purpose:** API key for OpenTripMap service
**Implementation:**
```typescript
// src/tools/opentripmap.ts:48
const key = process.env.NODE_ENV === 'test'
  ? (process.env.OPENTRIPMAP_API_KEY || 'test')
  : process.env.OPENTRIPMAP_API_KEY;
```
**Usage:** Required for attractions and points of interest data.

### `DEEP_RESEARCH_ENABLED`
**Default:** `true`
**Options:** `true | false`
**Purpose:** Enable/disable deep research functionality
**Implementation:**
```typescript
// src/core/router.ts:64
if (process.env.DEEP_RESEARCH_ENABLED === 'true') {

// src/core/blend.ts:151
if (process.env.DEEP_RESEARCH_ENABLED === 'true') {
```
**Usage:** When enabled, triggers deep research for complex travel queries using Crawlee.

### `CRAWLEE_MAX_PAGES`
**Default:** `8`
**Purpose:** Maximum pages to crawl during deep research
**Implementation:**
```typescript
// src/tools/crawlee_research.ts:22
const maxPages = Math.min(urls.length, parseInt(process.env.CRAWLEE_MAX_PAGES || '8'));

// src/tools/brave_search.ts:74
const maxPages = parseInt(process.env.CRAWLEE_MAX_PAGES || '8');
```

### `CRAWLEE_ENGINE`
**Default:** `cheerio`
**Options:** `cheerio | playwright`
**Purpose:** Web scraping engine for deep research
**Implementation:**
```typescript
// src/tools/crawlee_research.ts:17
const engine = process.env.CRAWLEE_ENGINE || 'cheerio';
```
**Usage:**
- `cheerio`: Fast, lightweight HTML parsing
- `playwright`: Full browser automation (slower but handles JavaScript)

---

## 🗃️ RAG & KNOWLEDGE BASE

### `POLICY_RAG`
**Default:** `on`
**Options:** `on | off`
**Purpose:** Enable/disable policy RAG functionality
**Implementation:**
```typescript
// src/config/vectara.ts:20
ENABLED: process.env.POLICY_RAG === 'on' || process.env.VECTARA_API_KEY !== '',
```

### `VECTARA_API_KEY`
**Purpose:** API key for Vectara RAG service
**Implementation:**
```typescript
// src/config/vectara.ts:10
API_KEY: process.env.VECTARA_API_KEY || '',
```

### `VECTARA_CORPUS_NAME`
**Default:** `navan`
**Purpose:** Default corpus name for Vectara queries
**Implementation:** Used as fallback when specific corpus not specified

### `VECTARA_BASE_URL`
**Default:** `https://api.vectara.io`
**Purpose:** Base URL for Vectara API
**Implementation:**
```typescript
// src/config/vectara.ts:6
BASE_URL: process.env.VECTARA_BASE_URL || 'https://api.vectara.io',
```

### `VECTARA_CUSTOMER_ID`
**Purpose:** Customer ID for Vectara authentication
**Implementation:**
```typescript
// src/config/vectara.ts:11
CUSTOMER_ID: process.env.VECTARA_CUSTOMER_ID || '',
```

### `VECTARA_CORPUS_AIRLINES`
**Purpose:** Corpus ID for airline policy data
**Implementation:**
```typescript
// src/config/vectara.ts:13
AIRLINES: process.env.VECTARA_CORPUS_AIRLINES || '',
```

### `VECTARA_CORPUS_HOTELS`
**Purpose:** Corpus ID for hotel policy data
**Implementation:**
```typescript
// src/config/vectara.ts:14
HOTELS: process.env.VECTARA_CORPUS_HOTELS || '',
```

### `VECTARA_CORPUS_VISAS`
**Purpose:** Corpus ID for visa policy data
**Implementation:**
```typescript
// src/config/vectara.ts:15
VISAS: process.env.VECTARA_CORPUS_VISAS || '',
```

### `VECTARA_CORPUS_DESTINATIONS`
**Purpose:** Corpus ID for destination information
**Implementation:**
```typescript
// src/config/vectara.ts:16
DESTINATIONS: process.env.VECTARA_CORPUS_DESTINATIONS || '',
```
**⚠️ WARNING:** This variable is defined in `.env` but **not actually used** anywhere in the codebase! It appears to be a planned feature that was never implemented.

---

## ⚡ CIRCUIT BREAKER & RATE LIMITING

### ❌ **NOT IMPLEMENTED**
These configuration variables are defined in `.env` but **not used anywhere in the codebase**. They appear to be planned features that were never implemented.

**Planned but unused variables:**
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD`
- `CIRCUIT_BREAKER_SUCCESS_THRESHOLD`
- `CIRCUIT_BREAKER_TIMEOUT`
- `CIRCUIT_BREAKER_RESET_TIMEOUT`
- `CIRCUIT_BREAKER_MONITORING_PERIOD`
- `RATE_LIMITER_MAX_CONCURRENT`
- `RATE_LIMITER_MIN_TIME`
- `RATE_LIMITER_RESERVOIR`
- `RATE_LIMITER_RESERVOIR_REFRESH_AMOUNT`
- `RATE_LIMITER_RESERVOIR_REFRESH_INTERVAL`

**Recommendation:** Remove these unused variables from `.env` file to reduce confusion.

---

## ☁️ CLOUD INFRASTRUCTURE (BEAM)

### ❌ **NOT IMPLEMENTED**
These Beam Cloud configuration variables are defined in `.env` but **not used anywhere in the codebase**. They appear to be planned for future cloud deployment but are currently unused.

**Planned but unused variables:**
- `BEAM_MODE`
- `BEAM_API_TOKEN`
- `BEAM_VOLUME`
- `BEAM_GPU`
- `BEAM_MEMORY`
- `BEAM_CPU`

**Note:** These variables are commented out in `.env` and have no implementation in the codebase.

**Recommendation:** These are safe to keep as they are commented out and don't interfere with current functionality.

---

## 🔧 ADDITIONAL CONFIGURATION OPTIONS

### ❌ Nebius AI Configuration (commented out - NOT IMPLEMENTED)
```bash
# Alternative LLM Provider (Nebius)
# NEBIUS_API_KEY=...
# NEBIUS_EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
# NEBIUS_BASE_URL=https://api.studio.nebius.com/v1/
```
**Status:** These variables are commented out in `.env` and **have no implementation** in the codebase. They appear to be planned as an alternative to OpenRouter but were never developed.

### ❌ Legacy Options (commented out - NOT IMPLEMENTED)
```bash
# USE_COMPROMISE_DATES=true  # Legacy date parsing
```
**Status:** This variable is commented out and **not used anywhere** in the codebase. Appears to be a legacy option that was removed.

---

## 📋 SUMMARY

### ✅ **IMPLEMENTED FEATURES**
This configuration supports:

1. **Multi-provider LLM support** with fallback chains
2. **Transformers-first NLP** with configurable models and timeouts
3. **External service integration** (search, maps, RAG)
4. **Comprehensive testing** (evaluation models, transcript recording)

Each environment variable is carefully implemented with proper defaults, type safety, and graceful fallbacks.

### ❌ **UNUSED/DEPRECATED VARIABLES**
The following variables are defined but **not implemented**:

**Circuit Breaker & Rate Limiting (11 variables):**
- All `CIRCUIT_BREAKER_*` and `RATE_LIMITER_*` variables

**Beam Cloud (6 variables):**
- All `BEAM_*` variables (commented out)

**Vectara (1 variable):**
- `VECTARA_CORPUS_DESTINATIONS`

**Alternative Providers (4 variables):**
- All `NEBIUS_*` variables (commented out)

**Legacy (1 variable):**
- `USE_COMPROMISE_DATES` (commented out)

### 🧹 **RECOMMENDATIONS**
1. **Remove unused variables** from `.env` to reduce confusion
2. **Keep commented variables** only if planning to implement them soon
3. **Document implementation status** clearly for future developers
