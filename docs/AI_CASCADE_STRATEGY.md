# AI Cascade Strategy - General Strategy

## General Cascade Principle

**Fast Methods → LLM → Fallback**

1. **Fast Methods** (NLP/Transformers/Heuristics) - for simple cases
2. **LLM** - for complex cases and contextual processing
3. **Fallback** - for cases when nothing worked

## Model Selection Strategy

### 🔧 **Global Configuration**
```bash
# Single switch controls all NLP tasks
NLP_USE_LOCAL=true   # Use local models for all tasks
NLP_USE_LOCAL=false  # Use HF Inference API for all tasks
```

### 🎯 **Task-Specific Models**

#### City/Location Recognition:
```
Local:  onnx/ner-bert-large-uncased-geocite (ONNX, optimized for cities)
Remote: Davlan/xlm-roberta-base-ner-hrl (HF Inference API)
```

#### General Entity Recognition:
```
Local:  Xenova/bert-base-multilingual-cased-ner-hrl
Remote: Davlan/xlm-roberta-base-ner-hrl (HF Inference API)
```

#### Intent Classification:
```
Local:  Xenova/nli-deberta-v3-base
Remote: facebook/bart-large-mnli (HF Inference API)
```

### 🚀 **Cascade Priority**
```
NLP_USE_LOCAL=true:  Local Models → LLM → Fallback
NLP_USE_LOCAL=false: Remote API → LLM → Fallback
```

### 📋 Content Classification
```
Transformers → LLM → Rule-based Fallback
```
- **Transformers**: Fast classification by patterns
- **LLM**: Processing complex cases and context
- **Fallback**: Simple rules for obvious cases

### 🎯 Intent Classification
```
Transformers → LLM → Keyword Fallback
```
- **Transformers**: Direct intent recognition
- **LLM**: Processing complex/composite queries
- **Fallback**: Keywords for basic intents

### 🔍 Query Processing
```
Slot Memory → LLM Router → Pattern Matching
```
- **Slot Memory**: Using context from previous queries
- **LLM Router**: Complex routing considering history
- **Pattern Matching**: Simple rules for obvious cases

### 🌐 Search & Summarization
```
Query Optimization → Search → LLM Summarization → Template Fallback
```
- **Query Optimization**: Improving query for search
- **Search**: Getting results
- **LLM Summarization**: Smart summarization with sources
- **Template Fallback**: Structured output without LLM

### ✅ Verification
```
Fact Checking → LLM Audit → Rule-based Validation
```
- **Fact Checking**: Checking facts against sources
- **LLM Audit**: Analyzing response quality
- **Rule-based**: Simple checks for compliance

## Cascade Selection Criteria

### When to use specific levels:

#### 🚀 Fast Methods (NLP/Transformers/Heuristics)
- ✅ High accuracy on simple cases
- ✅ Low latency
- ✅ Few resources (CPU/tokens)
- ✅ Deterministic result

#### 🤖 LLM
- ✅ Complex logic/context
- ✅ Ambiguous cases
- ✅ Need user adaptation
- ✅ Need explanation/justification

#### 🛡️ Fallback
- ✅ When LLM is unavailable
- ✅ For known patterns
- ✅ When deterministic result needed
- ✅ For critical cases

## Monitoring and Optimization

### Metrics to track:
- **Accuracy** by cascade levels
- **Response time** of each level
- **Usage frequency** of each level
- **Resources** (CPU, memory, tokens)

### Automatic optimization:
- Switching to LLM when fast method accuracy is low
- Caching results for repeating queries
- A/B testing different cascades

## Implementation Examples

### Entity Extraction for cities:
```
NER (LOC/GPE) → Multi-word heuristics → LLM disambiguation → Regex patterns
```

### Content Classification:
```
Transformers zero-shot → LLM context → Keyword rules
```

### Intent Classification:
```
Transformers classification → LLM complex cases → Keyword matching
```