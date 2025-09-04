# Voyant Travel Assistant

![Voyant Travel Assistant Screenshot](./assets/screenshot.png)

Builds trust first, then answers fast.

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
- **Brave Search API** - Fallback search engine for weather, country data, and attractions when primary APIs fail
- **OpenRouter API** - Free-tier LLM service for natural language processing

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
    B --> C{"Receipts mode?\n(/why or receipts flag)"}
    C -->|Yes| R1["Load last receipts\nfrom slot memory"]
    R1 --> R2["buildReceiptsSkeleton()"]
    R2 --> R3["verifyAnswer()"]
    R3 --> R4["Return ChatOutput\nwith receipts"]
    C -->|No| D["pushMessage()"]
    D --> E["runGraphTurn()"]

    E --> F{"Budget query?\n(cost, price, budget)"}
    F -->|Yes| F1["Add budget disclaimer"]
    F -->|No| F2["No disclaimer"]
    F1 --> G
    F2 --> G

    G --> H{"Awaiting search consent?"}
    H -->|Yes| H1["Check consent response\n(yes/no)"]
    H1 -->|Yes| H2["performWebSearchNode()"]
    H1 -->|No| H3["Return: 'No problem!'"]
    H -->|No| I["routeIntentNode()"]

    I --> J["routeIntent()"]
    J --> K{"Missing slots?"}
    K -->|Yes| L["buildClarifyingQuestion()"]
    L --> M["Return Clarification"]
    K -->|No| N["Intent Inference\n(if unknown + context)"]

    N --> O["setLastIntent()"]
    O --> P{"Intent"}

    P -->|weather| Q["weatherNode()"]
    P -->|destinations| R["destinationsNode()"]
    P -->|packing| S["packingNode()"]
    P -->|attractions| T["attractionsNode()"]
    P -->|web_search| U["webSearchNode()"]
    P -->|unknown| V["unknownNode()"]

    Q --> W["blendWithFacts()"]
    R --> W
    S --> W
    T --> W
    U --> W2["performWebSearchNode()"]
    V --> W

    W --> X["Detect mixed languages"]
    X --> Y["Targeted clarifications"]
    Y --> Z["Check explicit search commands"]
    Z --> AA["Check travel search patterns"]
    AA --> BB["Check unrelated patterns"]
    BB --> CC["Check system questions"]
    CC --> DD["Handle edge cases\n(long city, emoji, gibberish)"]

    DD --> EE{"Unknown intent processing"}
    EE -->|Explicit search| FF["performWebSearch()"]
    EE -->|Travel search worthy| GG["Set consent state\nfor web search"]
    EE -->|Restaurant/Budget| HH["Set consent state\nfor web search"]
    EE -->|Unrelated| II["Return travel-focused message"]
    EE -->|System| JJ["Return system info"]
    EE -->|Edge case| KK["Return appropriate message"]
    EE -->|Default unknown| LL["Ask for city/dates"]

    W -->|Intent-specific| MM["Check missing slots\nper intent"]
    MM -->|Missing| NN["Return clarification"]
    MM -->|Complete| OO["Fetch External Data"]

    OO --> PP["Weather: Open-Meteo\n→ Brave Search fallback"]
    OO --> QQ["Country: REST Countries\n→ Brave Search fallback"]
    OO --> RR["Attractions: OpenTripMap\n→ Brave Search fallback"]

    PP --> SS["Weather Facts"]
    QQ --> TT["Country Facts"]
    RR --> UU["Attractions Facts"]

    SS --> VV["Combine with LLM"]
    TT --> VV
    UU --> VV
    W -->|No external facts| VV

    VV --> WW["Validate Citations"]
    VV --> XX["setLastReceipts(thread)"]
    WW --> YY["Add language warning\nif mixed"]
    YY --> ZZ["Return Final Reply\n+ Citations"]

    W2 --> AAA["searchTravelInfo()"]
    AAA --> BBB["Format search results"]
    BBB --> CCC["Return web search reply"]

    H2 --> DDD["searchTravelInfo()"]
    DDD --> EEE["Format search results"]
    EEE --> FFF["Return web search reply"]
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

### Environment
```bash
# Configure LLM provider (optional)
export LLM_PROVIDER_BASEURL="https://api.openai.com/v1"
export LLM_API_KEY="your-api-key"
export LLM_MODEL="gpt-4"

# Or use free tier
export OPENROUTER_API_KEY="your-openrouter-key"
```