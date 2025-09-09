# CORE NLP MODULES - Complete Catalog

### Architectural Principles:
- **Transformers-first approach** with LLM fallback strategies
- **Dual-model architecture**: Zero-shot classification + NER
- **Multilingual support** (EN/RU/auto-detect)
- **Local-only models** (no internet dependencies)
- **Multi-level fallbacks** (Transformers.js → Dictionary → LLM)

---

## 🎯 REQUIRED MODELS & ARCHITECTURE

### **Model Requirements (3 models with local/remote variants):**

1. **Intent/Content Classification**
   - **Local Model**: `Xenova/nli-deberta-v3-base`
   - **Remote Model**: `facebook/bart-large-mnli`
   - **Task**: `zero-shot-classification`
   - **Purpose**: Intent detection (weather/packing/attractions/destinations) + content classification (travel/system/unrelated/budget/restaurant/flight/gibberish/emoji_only)
   - **Status**: ✅ **DOWNLOADED** (local), ✅ **AVAILABLE** (remote via HF API)
   - **Environment**: `TRANSFORMERS_CLASSIFICATION_MODEL_LOCAL` / `TRANSFORMERS_CLASSIFICATION_MODEL_REMOTE`

2. **Entity Extraction (NER)**
   - **Local Model**: `Xenova/bert-base-multilingual-cased-ner-hrl`
   - **Remote Model**: `Davlan/xlm-roberta-base-ner-hrl`
   - **Task**: `token-classification`
   - **Purpose**: Extract entities (LOC/ORG/PER/MISC) for city, person, and organization recognition
   - **Status**: ✅ **DOWNLOADED** (local), ✅ **AVAILABLE** (remote via HF API)
   - **Environment**: `TRANSFORMERS_NER_MODEL` (defaults to local for test, remote otherwise)

3. **Consent Classification**
   - **Model**: `Xenova/nli-deberta-v3-base` (same as content classification)
   - **Task**: `zero-shot-classification`
   - **Purpose**: Classify user consent responses (yes/no/unclear)
   - **Status**: ✅ **AVAILABLE** (reuses classification model)
   - **Labels**: `['positive consent', 'negative consent', 'unclear response']`

4. **Spell Correction** → Dictionary-based (no model)
   - **Reason**: No suitable local spell correction model available
   - **Implementation**: Enhanced TRAVEL_TYPOS dictionary with context patterns

### **Download Commands:**
```bash
# Classification model (local)
huggingface-cli download Xenova/nli-deberta-v3-base --local-dir-use-symlinks False

# NER model (local)
huggingface-cli download Xenova/bert-base-multilingual-cased-ner-hrl --local-dir-use-symlinks False
```

### **Model Storage:**
- **Local Cache**: `/Users/sasha/IdeaProjects/navan/root/models/Xenova/`
- **HuggingFace Cache**: `/Users/sasha/.cache/huggingface/hub/models--Xenova--*/`

---

## 🔧 NLP PIPELINE ARCHITECTURE

### **Enhanced Implementation Pattern (with Child Process Isolation):**

```typescript
// 1. Content Classification (with fallback)
import { classifyContent } from './transformers-classifier.js';
const contentClass = await classifyContent(text, log);
// Fallback: NLP → Rule-based → Default

// 2. Intent Classification (with fallback)
import { classifyIntent } from './transformers-classifier.js';
const intentClass = await classifyIntent(text, log);
// Fallback: NLP → Rule-based → Default

// 3. Entity Extraction (with IPC isolation)
import { extractEntities } from './ner.js';
const entities = await extractEntities(text, log);
// Auto-fallback: Local → Remote API
// Jest isolation: Child process → IPC worker

// 4. Consent Classification (when needed)
import { classifyConsent } from './nlp-consent-classifier.js';
const consent = await classifyConsent(text);
// Labels: ['positive consent', 'negative consent', 'unclear response']
```

### **Enhanced Processing Flow (with Multiple Fallbacks):**
```
User Input → Content Classification → Intent Classification → Entity Extraction → Specialized Processing
     ↓              ↓                        ↓                        ↓              ↓
Dictionary → Transformers (Local/Remote) → Transformers (Local/Remote) → NER (IPC/Local/Remote) → Consent/Preferences/Search
     ↓              ↓                        ↓                        ↓              ↓
Rule-based → LLM Fallback → Rule-based Fallback → Dictionary Fallback → LLM Fallback
     ↓              ↓                        ↓                        ↓              ↓
   Default → Default Classification → Default Intent → Empty Array → Default Response
```

### **Test Environment Isolation:**
```
Jest Runtime → Child Process (transformers-child.cjs) → Transformers.js → IPC → Main Process
     ↓                    ↓                              ↓            ↓          ↓
Float32Array → Process Isolation → WASM Worker → JSON Serialization → Safe Results
```

---

## 🎯 NLP FUNCTIONALITY CATEGORIES

### 1. 🔍 NER & ENTITY EXTRACTION (15 files)
**Purpose:** Extract named entities from text (LOC, PER, ORG, MISC)
**Model:** `Xenova/bert-base-multilingual-cased-ner-hrl` (token-classification)

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
- `src/core/transformers-classifier.ts` - **NEEDS FIX** - Should use `Xenova/nli-deberta-v3-base`

### 2. 🧠 INTENT DETECTION & CLASSIFICATION (12 files)
**Purpose:** Determine user intent and route requests
**Model:** `Xenova/nli-deberta-v3-base` (zero-shot-classification)

#### Core files:
- `src/core/nlp.ts` - **Main NLP orchestrator** (intent detection, slot extraction)
- `src/core/router.ts` - Request router
- `src/core/router.llm.ts` - LLM-based routing
- `src/core/transformers-classifier.ts` - **CRITICAL FIX NEEDED** - Replace regex with zero-shot classification

#### Intent parsing:
- `src/prompts/intent_parser.md` - Prompt for intent detection
- `src/prompts/nlp_intent_detection.md` - Prompt for NLP intent detection
- `src/core/parsers.ts` - Parsers for different data types

### 3. 🔤 TEXT PARSING & SPELL CORRECTION (18 files)
**Purpose:** Parse text and correct spelling errors
**Implementation:** Dictionary-based (no model)

#### Parsers:
- `src/core/parsers.ts` - **Universal parser** (city, date, intent, slots)
- `src/core/transformers-corrector.ts` - **NEEDS FIX** - Remove model loading, keep dictionary
- `src/core/city_cleaner.ts` - City name cleaning and normalization
- `src/core/slot_memory.ts` - Slot memory management

### 4. 📝 CONTENT CLASSIFICATION (8 files)
**Purpose:** Classify content type and relevance
**Model:** `Xenova/nli-deberta-v3-base` (zero-shot-classification)

#### Main files:
- `src/prompts/nlp_content_classification.md` - Prompt for content classification
- `src/core/llm.ts` - LLM with `classifyContent` function
- `src/core/clarifier.ts` - Clarifying questions generation
- `src/core/transformers-classifier.ts` - **CRITICAL FIX NEEDED**

#### Content types:
- `system`, `travel`, `unrelated`, `budget`, `restaurant`, `flight`, `gibberish`, `emoji_only`, `refinement`

### 5. 🎢 ATTRACTIONS CLASSIFICATION (2 files)
**Purpose:** Classify attractions for family/kid-friendly filtering
**Model:** `Xenova/nli-deberta-v3-base` (zero-shot-classification) + LLM fallback
**Implementation:** NLP cascade with rule-based fallback

#### Main files:
- `src/core/nlp-attractions-classifier.ts` - **NLP-based attraction classification**
- Enhanced with LLM fallback for complex cases

#### Features:
- Kid-friendly detection using content analysis
- Category classification (family, educational, cultural)
- Confidence scoring and reasoning
- Negative keyword filtering (casino, nightclub, etc.)

### 6. 🤝 CONSENT CLASSIFICATION (1 file)
**Purpose:** Classify user consent responses for web search permissions
**Model:** `Xenova/nli-deberta-v3-base` (zero-shot-classification)
**Labels:** `['positive consent', 'negative consent', 'unclear response']`

#### Main files:
- `src/core/nlp-consent-classifier.ts` - **Consent detection system**

#### Features:
- High-confidence requirement (70% threshold)
- Three-state classification (yes/no/unclear)
- Fallback to 'unclear' for ambiguous responses

### 7. 🎯 TRAVEL PREFERENCES EXTRACTION (1 file)
**Purpose:** Extract travel preferences from user queries
**Implementation:** NLP cascade (Transformers → LLM → fallback)
**Features:** Travel style, budget level, activity type, group type detection

#### Main files:
- `src/core/preference-extractor.ts` - **Preference extraction with NLP cascade**

#### Preference Types:
- **Travel Style**: `family`, `romantic`, `adventure`, `cultural`, `business`, `budget`, `luxury`
- **Budget Level**: `low`, `mid`, `high`
- **Activity Type**: `museums`, `nature`, `nightlife`, `shopping`, `food`, `history`
- **Group Type**: `solo`, `couple`, `family`, `friends`, `business`

### 8. 🔍 SEARCH QUERY OPTIMIZATION (1 file)
**Purpose:** Optimize search queries for better web search results
**Implementation:** NLP-enhanced query building with entity extraction
**Model:** Combined transformers pipeline + entity recognition

#### Main files:
- `src/core/search-query-optimizer.ts` - **Query optimization with transformers**

#### Query Types:
- `weather`, `attractions`, `destinations`, `country`, `general`
- Entity-enhanced query building
- Relevance scoring and ranking

### 9. 📊 SEARCH RESULT EXTRACTION (1 file)
**Purpose:** Extract and summarize relevant information from search results
**Implementation:** Content classification + entity extraction + summarization
**Features:** Result relevance scoring, entity extraction, confidence-based filtering

#### Main files:
- `src/core/search-result-extractor.ts` - **Search result processing and summarization**

#### Extraction Types:
- `weather`, `attractions`, `country`, `general`
- Multi-result ranking and filtering
- Structured data extraction

---

## 🔧 CONFIGURATION & ENVIRONMENT VARIABLES

### **Model Selection & Environment Configuration:**

#### NER Configuration:
```bash
NER_MODE=local|remote|auto                    # NER operation mode (default: auto)
NER_USE_LOCAL=true                           # Legacy flag for local-only mode
TRANSFORMERS_NER_MODEL=Xenova/bert-base-multilingual-cased-ner-hrl  # Local model
HF_TOKEN=your_token_here                      # Required for remote API access
```

#### Classification Configuration:
```bash
# Local models (downloaded)
TRANSFORMERS_CLASSIFICATION_MODEL_LOCAL=Xenova/nli-deberta-v3-base
TRANSFORMERS_CLASSIFICATION_MODEL_REMOTE=facebook/bart-large-mnli

# Model selection logic (automatic based on environment)
# - Test environment: Local models (via child process)
# - Production: Remote models (via HF API)
# - NER_USE_LOCAL=true: Force local models
```

#### General NLP Configuration:
```bash
LOG_LEVEL=debug|info|warn|error               # Logging level (info+ suppresses transformers console)
NODE_ENV=test|development|production          # Environment detection
CLASSIFICATION_CONFIDENCE_THRESHOLD=0.6       # Minimum confidence for classification
NER_TIMEOUT_MS=2000                          # NER timeout (local)
REMOTE_TIMEOUT_MS=5000                       # NER timeout (remote)
MAX_TEXT_LENGTH=512                          # Maximum text length for processing
```

#### Transformers.js Environment:
```bash
# Automatically configured via transformers-env.js
# - allowRemoteModels: false (offline-first)
# - allowLocalModels: true
# - localModelPath: ./models/
# - WASM threading: 1 thread, proxy mode
```

---

## 🏗️ ENHANCED ARCHITECTURE PATTERNS

### **Multi-Level Fallback Architecture:**

All NLP modules follow a consistent **NLP → LLM → Fallback** pattern:

```typescript
async function processWithFallback(input: string): Promise<Result> {
  // Level 1: Try Transformers.js (fast, local)
  try {
    const nlpResult = await tryNLPProcessing(input);
    if (nlpResult.confidence > 0.6) return nlpResult;
  } catch (error) {
    log.debug('NLP failed', error);
  }

  // Level 2: Try LLM (robust, external)
  try {
    const llmResult = await tryLLMProcessing(input);
    if (llmResult.confidence > 0.4) return llmResult;
  } catch (error) {
    log.debug('LLM failed', error);
  }

  // Level 3: Rule-based fallback (reliable, deterministic)
  return ruleBasedFallback(input);
}
```

### **Test Environment Isolation:**

For Jest compatibility, transformers operations use child processes:

```typescript
// In test environment
const result = await zeroShotInChild(modelName, text, labels);
// Child process: transformers-child.cjs
// - Isolated Float32Array realm
// - WASM worker threading
// - JSON serialization
// - IPC communication
```

### **Auto-Fallback Strategies:**

1. **Model Fallback**: Local model → Remote API → Empty result
2. **Method Fallback**: NLP → LLM → Rule-based → Default
3. **Environment Fallback**: Child process → IPC worker → Error handling

### **Performance Optimizations:**

- **Lazy Loading**: Models loaded only when first needed
- **Caching**: Pipeline instances cached across calls
- **Timeouts**: Configurable timeouts prevent hanging
- **Text Truncation**: 512 character limit for efficiency
- **Console Suppression**: Clean logs in production

---

## 📊 CURRENT SYSTEM STATUS

### ✅ **Fully Operational:**
- `src/core/ner.ts` - Unified NER with IPC/remote fallback
- `src/core/transformers-classifier.ts` - Classification with child process isolation
- `src/core/nlp-attractions-classifier.ts` - Attraction classification system
- `src/core/nlp-consent-classifier.ts` - Consent detection
- `src/core/preference-extractor.ts` - Travel preferences extraction
- `src/core/search-query-optimizer.ts` - Query optimization
- `src/core/search-result-extractor.ts` - Result processing
- `scripts/transformers-child.cjs` - Child process for Jest isolation

### 📁 **Model Cache Status:**
- ✅ `Xenova/nli-deberta-v3-base` (classification) - Downloaded
- ✅ `Xenova/bert-base-multilingual-cased-ner-hrl` (NER) - Downloaded
- ✅ `facebook/bart-large-mnli` (remote classification) - Available via API
- ✅ `Davlan/xlm-roberta-base-ner-hrl` (remote NER) - Available via API

---





### **Working files (no changes needed):**
- ✅ `src/core/ner.ts` - Already uses correct NER model
- ✅ `src/core/transformers-detector.ts` - Uses langdetect library correctly
- ✅ `src/core/parsers.ts` - Proper Transformers → LLM → Regex degradation

---

## 🎯 KEY FUNCTIONS

### Intent Types:
- `weather` - weather queries
- `packing` - travel packing queries
- `attractions` - attractions and activities
- `destinations` - travel destinations
- `system` - system commands and bot queries
- `unknown` - unrecognized queries
- `web_search` - external search requests
- `restaurant` - dining and food queries
- `flight` - flight and transportation queries

### Entity Types (NER):
- `LOC` - locations (cities, countries, landmarks)
- `PER` - persons (travelers, contacts)
- `ORG` - organizations (airlines, hotels, companies)
- `MISC` - miscellaneous (dates, times, currencies)

### Content Types:
- `system` - bot/system interactions
- `travel` - travel planning and queries
- `unrelated` - off-topic conversations
- `budget` - pricing and cost discussions
- `restaurant` - dining recommendations
- `flight` - transportation and flights
- `gibberish` - nonsensical input
- `emoji_only` - emoji-only messages
- `refinement` - query refinements and modifications

### Consent States:
- `yes` - positive consent for web search
- `no` - negative consent
- `unclear` - ambiguous or unclear response

### Travel Preferences:
- **Travel Style**: `family`, `romantic`, `adventure`, `cultural`, `business`, `budget`, `luxury`
- **Budget Level**: `low`, `mid`, `high`
- **Activity Type**: `museums`, `nature`, `nightlife`, `shopping`, `food`, `history`
- **Group Type**: `solo`, `couple`, `family`, `friends`, `business`

---

## 🚀 MAIN ENTRY POINTS

### Core NLP Functions:
- `detectIntentAndSlots()` - Intent and slot detection with LLM routing
- `extractEntities()` - Unified NER with IPC/remote fallback
- `classifyContent()` - Content classification (NLP → LLM → fallback)
- `classifyIntent()` - Intent classification (NLP → LLM → fallback)
- `classifyConsent()` - Consent detection for web search
- `extractTravelPreferences()` - Travel preferences extraction (NLP cascade)
- `classifyAttractions()` - Attraction filtering for family-friendly content

### Specialized Functions:
- `extractCityLLM()`, `parseDatesLLM()` - LLM-powered parsing
- `clarifierLLM()` - Generate clarifying questions
- `optimizeSearchQuery()` - Enhance search queries with NLP
- `extractSearchResults()` - Process and summarize search results
- `correctSpelling()` - Dictionary-based spell correction

### Model Management:
- `getModelName(isLocal)` - Dynamic model selection
- `shouldUseLocal()` - Environment-based model choice
- `loadLocalPipeline()`, `callRemoteAPI()` - Model loading strategies

### Models and Configuration:
- **Intent/Content Classification**: `Xenova/nli-deberta-v3-base` (local) / `facebook/bart-large-mnli` (remote)
- **Entity Extraction**: `Xenova/bert-base-multilingual-cased-ner-hrl` (local) / `Davlan/xlm-roberta-base-ner-hrl` (remote)
- **Consent Classification**: `Xenova/nli-deberta-v3-base` (reuses classification model)
- **Language Detection**: `langdetect` library (when needed)
- **Spell Correction**: Enhanced dictionary (TRAVEL_TYPOS)
- **LLM Integration**: OpenAI/HuggingFace API (fallback for complex cases)

---

## 📈 ARCHITECTURAL ADVANCEMENTS (2024)

### **Key Improvements Over Previous Version:**

1. **Multi-Model Architecture**: Local/remote model pairs with automatic fallback
2. **Child Process Isolation**: Jest-compatible transformers execution
3. **Enhanced Fallback Chains**: NLP → LLM → Rule-based → Default
4. **Specialized Classifiers**: Consent, attractions, preferences, search optimization
5. **IPC Communication**: Worker-based NER processing for test environments
6. **Performance Optimizations**: Lazy loading, caching, timeouts, text truncation
7. **Comprehensive Error Handling**: Graceful degradation at every level
8. **Offline-First Design**: Local models prioritized, remote as fallback

