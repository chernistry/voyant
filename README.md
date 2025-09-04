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
- **Wikipedia API** - Tourist attractions and points of interest search  // Currently being refactored to OpenTripMap
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
    B --> C{"Receipts mode? (/why or receipts flag)"}
    C -->|Yes| R1["Load last receipts from slot memory"]
    R1 --> R2["buildReceiptsSkeleton()"]
    R2 --> R3["verifyAnswer()"]
    R3 --> R4["Return ChatOutput with receipts"]
    C -->|No| D["pushMessage()"]
    D --> E["runGraphTurn()"]

    E --> F["routeIntentNode()"]
    F --> G["routeIntent()"]

    G --> H{"Missing slots?"}
    H -->|Yes| I["buildClarifyingQuestion()"]
    I --> J["Return Clarification"]
    H -->|No| K["Intent Handler"]

    K --> L["Weather"] --> M["blendWithFacts()"]
    K --> L2["Destinations"] --> M
    K --> L3["Packing"] --> M
    K --> L4["Attractions"] --> M
    K --> L5["Unknown"] --> M

    M --> N["Fetch External Data"]

    N --> W0["Weather: Open-Meteo"]
    W0 --> W1["Weather Facts"]
    N --> Wf0{"Open-Meteo failed?"}
    Wf0 -->|Yes| WB["Brave Search (weather)"]
    WB --> W1b["Web Search Facts"]

    N --> C0["Country: REST Countries"]
    C0 --> C1["Country Facts"]
    N --> Cf0{"REST Countries failed?"}
    Cf0 -->|Yes| CB["Brave Search (country)"]
    CB --> C1b["Web Search Facts"]

    N --> A0["Attractions: Wikipedia/Brave Search"]
    A0 --> A1["Attractions Facts"]
    N --> Af0{"Wikipedia failed?"}
    Af0 -->|Yes| AB["Brave Search (attractions)"]
    AB --> A1b["Web Search Facts"]

    W1 --> O["Combine with LLM"]
    W1b --> O
    C1 --> O
    C1b --> O
    A1 --> O
    A1b --> O
    M -->|No external facts| O

    O --> P["Validate Citations"]
    O --> S["setLastReceipts(thread)"]
    P --> T["Return Final Reply"]
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