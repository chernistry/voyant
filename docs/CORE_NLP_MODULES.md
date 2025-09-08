# CORE NLP MODULES - Complete Catalog

### Architectural Principles:
- **Transformers-first approach** with LLM fallback strategies
- **Dual-model architecture**: Zero-shot classification + NER
- **Multilingual support** (EN/RU/auto-detect)
- **Local-only models** (no internet dependencies)
- **Multi-level fallbacks** (Transformers.js → Dictionary → LLM)

---

## 🎯 REQUIRED MODELS & ARCHITECTURE

### **Model Requirements (2 models needed):**

1. **Intent/Content Classification** → `Xenova/nli-deberta-v3-base`
   - **Task**: `zero-shot-classification`
   - **Usage**: `pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-base')`
   - **Purpose**: Intent detection (weather/packing/attractions/destinations) + content classification (travel/system/unrelated/budget)
   - **Status**: ❌ **NEEDS DOWNLOAD**

2. **Entity Extraction (NER)** → `Xenova/bert-base-multilingual-cased-ner-hrl`
   - **Task**: `token-classification`
   - **Usage**: `pipeline('token-classification', 'Xenova/bert-base-multilingual-cased-ner-hrl')`
   - **Purpose**: Extract entities (LOC/ORG/PER) after intent is determined
   - **Status**: ✅ **ALREADY CACHED** at `/Users/sasha/.cache/huggingface/hub/models--Xenova--bert-base-multilingual-cased-ner-hrl`

3. **Spell Correction** → Dictionary-based (no model)
   - **Reason**: No suitable local spell correction model available
   - **Implementation**: Enhanced TRAVEL_TYPOS dictionary with context patterns

### **Download Command:**
```bash
huggingface-cli download Xenova/nli-deberta-v3-base --local-dir-use-symlinks False
```

---

## 🔧 NLP PIPELINE ARCHITECTURE

### **Correct Implementation Pattern:**
```typescript
// 1. Intent Classification (zero-shot)
const intentClassifier = await pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-base');
const labels = ['weather', 'packing', 'attractions', 'destinations', 'system', 'unknown'];
const intentResult = await intentClassifier(text, labels, {
  hypothesis_template: 'This text is about {}.'
});

// 2. Entity Extraction (NER) - after intent is determined
const nerPipeline = await pipeline('token-classification', 'Xenova/bert-base-multilingual-cased-ner-hrl');
const entities = await nerPipeline(text);

// 3. Spell Correction (dictionary-based)
const corrected = applyTravelTypoCorrections(text);
```

### **Processing Flow:**
```
User Input → Spell Correction → Intent Classification → Entity Extraction → Slot Filling
     ↓              ↓                    ↓                    ↓              ↓
Dictionary → nli-deberta-v3-base → bert-multilingual-ner → Slot Memory → Response
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
- `system`, `travel`, `unrelated`, `budget`

---

## 🔧 CONFIGURATION & ENVIRONMENT VARIABLES

### NER Configuration:
```bash
NER_MODE=local|remote|auto          # NER operation mode
NER_USE_LOCAL=true                  # Use local models only
TRANSFORMERS_NER_MODEL=Xenova/bert-base-multilingual-cased-ner-hrl
```

### Classification Configuration:
```bash
TRANSFORMERS_CLASSIFICATION_MODEL=Xenova/nli-deberta-v3-base  # Intent/content classification
CLASSIFICATION_CONFIDENCE_THRESHOLD=0.7                       # Minimum confidence
```

### Language Detection:
```bash
LOG_LEVEL=debug|info|warn|error      # Logging level
NODE_ENV=test|development|production # Environment
```

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
- `attractions` - attractions
- `destinations` - travel destinations
- `system` - system commands
- `unknown` - unrecognized queries

### Entity Types (NER):
- `LOC` - locations (cities, countries)
- `PER` - persons
- `ORG` - organizations
- `MISC` - miscellaneous

### Content Types:
- `system`, `travel`, `unrelated`, `budget`

---

## 🚀 MAIN ENTRY POINTS

### Main functions:
- `detectIntentAndSlots()` - Intent and slot detection
- `extractEntities()` - Entity extraction via NER
- `parseCity()`, `parseDate()`, `parseIntent()` - Specialized parsers
- `classifyContent()` - Content classification (NEEDS FIX)
- `classifyIntent()` - Intent classification (NEEDS FIX)
- `correctSpelling()` - Spell correction (dictionary-based)

### Models and configuration:
- **Intent/Content Classification**: `Xenova/nli-deberta-v3-base` (zero-shot-classification)
- **Entity Extraction**: `Xenova/bert-base-multilingual-cased-ner-hrl` (token-classification)
- **Language Detection**: `langdetect` library
- **Spell Correction**: Enhanced dictionary (TRAVEL_TYPOS)
- **LLM Integration**: OpenAI/HuggingFace API (fallback only)

