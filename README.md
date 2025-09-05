# Voyant Travel Assistant

>Builds trust, then answers fast.

![Voyant Travel Assistant Screenshot](./assets/screenshot.png)


>This minimalist, fact-grounded travel assistant employs an LLM-driven approach for NLP tasks (intent classification, slot filling, context-aware generation), pulling verified data from trusted APIs (Open-Meteo/REST Countries/OpenTripMap) with multi-layered hallucination prevention via mandatory citations and secondary verification.

## Why is it cool?

- Self-evaluates and prevents hallucinations
- Falls back to Brave web search when APIs fail
- End-to-end tests with actual agent interactions using LLM-based eval

## Notes on Prompt Engineering

- **Format Priming**: Enforced JSON/bullet-point schemas ensure structured, parseable outputs while preventing hallucinations
- **Few-Shot Prompting**: Curated examples in router.md and cot.md train accurate intent classification and slot extraction
- **Chain-of-Thought**: Structured reasoning in cot.md and verify.md decomposes analysis into verifiable steps
- **Guardrails**: blend.md requires fact-grounding + verify.md provides secondary validation of claims

## Other perks

- Anti-hallucination receipts with self-check and sources
- Resilient data blend: APIs → search fallback when providers fail
- Smart routing + memory for natural multi-turn conversations
- Clean interfaces: interactive CLI and REST API
- Strong engineering: TS+Zod validation, tests, metrics, structured logs

## Quick Start
```bash
# Install dependencies
npm install

# Start CLI
npm run cli

# Or start HTTP server
npm run dev

# Run tests
npm test

# Generate test transcripts (JSON + Markdown)
npm run test:transcripts

# Alternative: RECORD_TRANSCRIPTS=true npm test
```

## What it demonstrates

- Conversational quality with context carry-over
- Prompt design with guided reasoning and concise outputs
- Decision policy: when to call APIs vs rely on model knowledge (never by design)
- Failure handling: retries, graceful degradation, verifiable answers

## External APIs

The agent connects to several external APIs for real-time travel data, with resilient fallback mechanisms:

- **Open-Meteo API** - Weather forecasts and geocoding (city coordinates resolution)
- **REST Countries API** - Country information (currency, languages, region, capital)
- **OpenTripMap API** - Tourist attractions and points of interest search
- **Brave Search API** - Fallback search engine for weather, country data, and attractions when primary APIs fail. Features LLM-powered summarization of search results into coherent 2-paragraph responses with numbered citations.
- **OpenRouter API** - Free-tier LLM service for natural language processing

## Configuration

### Environment Variables

```bash
# Configure LLM provider (optional)
export LLM_PROVIDER_BASEURL="https://api.openai.com/v1"
export LLM_API_KEY="your-api-key"
export LLM_MODEL="gpt-4"

# Or use free tier
export OPENROUTER_API_KEY="your-openrouter-key"

# Search summarization (default: on)
export SEARCH_SUMMARY=on  # or 'off' to disable
```

## Testing & Transcripts

Generate conversation transcripts during E2E tests for assignment deliverables:

```bash
# Run tests with transcript recording
npm run test:transcripts

# Or manually enable transcripts
RECORD_TRANSCRIPTS=true npm test

# Run specific tests
RECORD_TRANSCRIPTS=true npm test -- tests/e2e_comprehensive_flow.test.ts
```

**Output**: JSON + Markdown transcripts in `deliverables/transcripts/` directory

## Agent Decision Flow

```mermaid
flowchart TD
    A["User Message"] --> B["handleChat()"]
    B --> C{"Receipts mode? (/why or receipts)"}
    C -->|Yes| R1["Load last receipts from slot memory"]
    R1 --> R2["buildReceiptsSkeleton()"]
    R2 --> R3["verifyAnswer() (LLM JSON)"]
    R3 --> R4["Return receipts-only reply"]
    C -->|No| D["pushMessage(threadId)"]
    D --> E["runGraphTurn(message, threadId)"]

    %% Pre-routing checks: consent gate
    E --> F["classifyContent() (LLM): type, explicit search, mixed languages"]
    F --> G{"Awaiting search consent?"}
    G -->|Yes| G1["detectConsent() (LLM): yes/no/unclear"]
    G1 -->|yes| H1["optimizeSearchQuery()"]
    H1 --> H2["performWebSearchNode()"]
    H2 --> H2a["summarizeSearchResults (LLM) → reply + citations ['Brave Search']"]
    G1 -->|no| H3["Reply: No problem..."]
    G -->|No| I["routeIntentNode()"]

    %% Routing and slots
    I --> J["routeIntent():<br>- classifyContent + classifyIntent (LLM)<br>- extractSlots (city/date parsers)<br>- LLM router + fallback heuristics"]
    J --> K{"Missing slots? (city/dates rules)"}
    K -->|Yes| L1["buildClarifyingQuestion() (LLM → fallback)"]
    L1 --> L2["Return single targeted question"]
    K -->|No| M["setLastIntent(); merge slots; updateThreadSlots()"]

    %% Intent switch
    M --> N{"Intent"}
    N -->|weather| Q["weatherNode() → blendWithFacts()"]
    N -->|destinations| R["destinationsNode() → blendWithFacts()"]
    N -->|packing| S["packingNode() → blendWithFacts()"]
    N -->|attractions| T["attractionsNode() → blendWithFacts()"]
    N -->|web_search| U["webSearchNode()"]
    N -->|system| SYS["systemNode()"]
    N -->|unknown| V["unknownNode() → blendWithFacts()"]

    %% Consent offers inside intents
    T --> TA{"restaurant/budget query?"}
    TA -->|Yes| TAC["set awaiting_search_consent + pending_search_query; ask consent to web search"]
    TA -->|No| T0["continue"]
    R --> RB{"flight/budget query?"}
    RB -->|Yes| RBC["set awaiting_search_consent + pending_search_query; ask consent to web search"]
    RB -->|No| R0["continue"]

    %% Facts blend and external tools
    Q --> W1["getWeather (Open‑Meteo → fallback Brave) → facts"]
    S --> W1
    R0 --> W1
    R0 --> W3["getCountryFacts (REST Countries → fallback Brave) → facts"]
    R0 --> W4["recommendDestinations (catalog + REST Countries) → facts"]
    T0 --> T1["Wikipedia attractions → facts"]
    T1 -->|fail/empty| T2["OpenTripMap → fallback Brave → facts"]

    %% Web search path
    U --> X1["searchTravelInfo (Brave)"]
    X1 --> X2{"Results?"}
    X2 -->|Yes| X3["search_summarize (LLM): 1–3 paragraphs with [n] cites + Sources list"]
    X3 --> X4["Return reply + citations ['Brave Search']"]
    X2 -->|No| X5["Reply: couldn't find relevant info"]

    %% Unknown intent handling
    V --> V1{"Explicit search or needs web search?"}
    V1 -->|Yes| U
    V1 -->|No| V2{"Unrelated/System/Edge cases?"}
    V2 -->|Unrelated| V3["Reply: I'm a travel assistant for travel queries"]
    V2 -->|System| SYS
    V2 -->|Emoji/Gibberish/Empty/Very long| V4["Ask for a clearer travel question"]
    V2 -->|Otherwise| L1

    %% Compose final answer
    W1 --> Y["getPrompt(system/cot/blend) → callLLM"]
    W3 --> Y
    W4 --> Y
    T1 --> Y
    T2 --> Y
    V --> Y
    Y --> Z1["validateNoCitation()"]
    Z1 --> Z2{"facts collected?"}
    Z2 -->|Yes| Z3["setLastReceipts(threadId)"]
    Z3 --> Z6["Append one source mention if missing"]
    Z2 -->|No| Z6
    Z6 --> Z7{"Mixed languages?"}
    Z7 -->|Yes| Z8["Prefix warning"]
    Z7 -->|No| Z9["No warning"]
    Z8 --> Z10["Return final reply (+ citations if any)"]
    Z9 --> Z10

    %% Fallbacks
    E --> Fallbacks["Heuristic routing only when LLM unavailable/low confidence"]
```

## Usage

### CLI Interface
```bash
# Interactive conversation
npm run cli

You> What's the weather in Tel-Aviv today?
Assistant> • Today's weather in Tel Aviv: High 30.4°C, Low 25.5°C (Open-Meteo)

You> /why
Assistant> --- RECEIPTS ---
Sources: Open-Meteo
Decisions: Used weather API because user asked about weather or it informs packing.
Self-Check: pass (All data points are covered by the provided fact.)
Budget: 0ms API, ~400 tokens
```

### REST API (example)
```bash
# Get weather with receipts
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What to pack for Tokyo in March?", "receipts": true}'
```
