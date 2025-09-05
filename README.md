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

🔗 [View Interactive Flow Diagram](https://www.mermaidchart.com/play#pako:eNq1V91SGzcUfpUzzHQw0ybmL3-kk4wxjoEASWxjwCHDyLuyvY1W2qy0GDdkJled3rZ9iL5XnqTnSPJqDWRKL8oNs_LR0Xe-8_95KVIxX9paOpcjoabRhOUGejvnEvCv8f586VjzHA651mzMz5c-wIMHL6Cx-vl8qZVmZlbnqfolqY-T4ZDniZ68PF_64u-ukuj1GdfX0FhDRR2eidkWNPRHGKkcGESCsxxMzi65gE8F1yZREp9YuH-krmEbb0-YjAVvTpiprZQy2xZN8zMpj3iSGQ0pWvMSavXpZAb4Su7PV0pczQCrQ7AOFItBMG1KWRjlKgUtlIEUzctn5XudNftgZx3vDYtExPNnux-54EbJCrbOupPdQNlL5GY0a0g95XltBWoHB4ew331zVJHecNKblihT5LKE80BJMcMvZK8Ub5bc7OCFrNAT76GameScxXtxUL1jNbdQLi9kO2fZpIfqa6m78BMs3nB3fvgBmkpqLg2MmeEahhx9xiFXhUnk2Am1rOI2st-YsoTOYcqHoNGr0QQidz8ERDsQ3ybiY254ZPwznpWVLZhxXZeqXkgbHqUVbUv99Yyu79J1lZkkTX7lXfvcu4Lnswr7u85Tu-SpjOcIPj3hQyd7hCFSFV33ogxldZGmLC_VdrguBEbEt9_-dB6AHyFKDKNI1fB-eZuCF5zs8oebYCX6Z3cjhP6RgixXQ8HThw8fBuHSl-3NKpcx5xk--l06Nyt8PvrvfD4KfLYfB5Z28NWOf_QGUe3HzuFPQowuYrzF0M3XiJD2U7z-igkxZNHHLRtRHDIuY7L5E7kRLhPmzitwN0uW9iiS6dc9adDSCsgydjsuTAFrhs1jDTWn7yFVAiu1Z23ZX9RVW9n6eZi_eICliWmNKYts0jnZ5E-coCPXyfIrLGGR6bp30PZZPWZkE8uxdGovpU2eRAYo8x0UG1NDppPIHtoIKwQPnO07hFRqd1qttxedVrfV6DR3L1pHje2D1g58-_1vDIs0E_wqhMV-pezuU550uQHmY-qC_HUx99eFjym0boH_58CwRs9_rE0TQ65lWkkUCeGwHwr0a8R4mCA_qMLy_bJChHZ2hQq877LDgoICObqGlvvldcB-sDavsU3BqHqi7ne-R8xLKHE28pEUcB241D9YD2FKwAQHw_IxJkl8u9m8Lk05pCLAzQE2hHlMPMc2gBdhlAj0G_ch9RyKjMzr2fJpvX8zDH2saGQQs8P6WyDR1JeMUkI7wUML9wgpdPIlT0cW1JQzMyGO3iEy_-FiPmg8QRe9whjUlWx1t2MyVLpsxIZny0Q4ub-eDClGEq-hS6XCfdz_NjM2RRyIHmqoHNxfCzaXCxe513Bsybi7oDtpPdOGpwj4jCC7rzsFC_lRqqm8hj7K-Y9_A3WrS6rRCHMdEqmTmOM_ciRWA3s5FJ2edXWvgb7GJDSsyBnetUkXMrjXCFnQazRdPIYU_l7uzn-4I4WNqjTm0nr_DgV9bxVfQWl8oOBhJnEjyTai5VeZSDCjYSSS8eQW5M52Zaja_v8g-3cIcucW5NIn1lE-1agDYIHmuWSimnTvrG0nVGSwJJy4tILaG0T27esfh1gl1EJ5AdvpV_wZ6i8xdb0mj3D1zs8N905TFdLkMwewhgW9B-4o4fqez8010qCIE6JKUzRzp5LTWHmZYUKNkefFF-5S13PqelQsyfhenmSHLLsDzI3LJdsnYeTLkMV5p62HbPXp4HPg2D54umaDhH7u2QVgT44U1JzZJbpTV8pP1-2Eb0exEHSn6yHoTjdKdRflCDefgNa-ff1rg9oxG9P0q5GYriryCDkXiTbhNTeDny7M4Pee-Twcis3TR2Hmi1QhYrmMmZNgKOa4JlxSzido7iKPx67yeLLA7jvUT2_WkL4F2V-jDWyelc7yQE1_LVBzvHBE8PpE57FELNi-4nrXlsZ6K8YWFzHNKxT3nU2lLN6tjLN7yylucX5_o-kIKxoip-UuLHUUeCVHXl83lOaF85bdJdvzXbLuNsw-jYRCUfPpk2tuLJD8-yukV_uGcnuaaE5TxULtTjOlqa9TcWB2O7tF94kLwTOXwG9xM8xMzXWTeqRM3Yq7zIowXzDiyudPXDyd-a_N6ldvvfrVr36c2Y8BJcglEwnNGEeq6QOw0r0GDtmAvGnzEmNNCFwBeBw8OKgkyWAjzDbzxfWOfXHgYA9oKWhkmR1YJAdtUwZHIUk4IBlB6ia-cDFkwOCxP3Irw-CJHRCvOG3aclzg3lmJssGTCkbaDt7mfJRcwZTlckH_k6D_GYrhOnVL5KknbzXksHOvy-RaNZXRBCZnFcOfzS8vNBNXBHV1bSgP8ZVdXmCwGhzj_XIMdl-fTri0g30h2SVLBMNAqQs1pQ43whlBRtS1lr78A3_5tkk)

```mermaid
flowchart TD
    A["User Message"] --> A0{"Empty/emoji/gibberish?"}
    A0 -->|Yes| A1["Reply: Ask for a clear travel question"]
    A0 -->|No| B["handleChat()"]
    B --> C{"Receipts mode? (/why or receipts)"}
    C -->|Yes| R1["Load last receipts from slot memory"]
    R1 --> R2["buildReceiptsSkeleton()"]
    R2 --> R3["verifyAnswer() (LLM JSON)"]
    R3 --> R4["Return receipts-only reply"]
    C -->|No| D["pushMessage(threadId)"]
    D --> E["runGraphTurn(message, threadId)"]

    %% Consent gates before routing
    E --> G{"Awaiting web search consent?"}
    G -->|Yes| G1["detectConsent() (LLM): yes/no/unclear"]
    G1 -->|yes| H1["optimizeSearchQuery()"]
    H1 --> H2["performWebSearchNode()"]
    H2 --> H2a["summarizeSearchResults → reply + citations ['Brave Search']"]
    G1 -->|no| H3["Reply: No problem..."]
    G -->|No| G4{"Awaiting deep research consent?"}
    G4 -->|Yes| G5["detectConsent() (LLM): yes/no/unclear"]
    G5 -->|yes| G6["performDeepResearchNode()"]
    G6 --> G7["Return deep research reply + citations"]
    G5 -->|no| G8["Fallback: route pending query via router"]
    G4 -->|No| I["routeIntentNode()"]

    %% Routing and slots (router.ts)
    I --> J["routeIntent():<br>- classifyContent + classifyIntent (LLM)<br>- extractSlots (city/date parsers)<br>- strict LLM router → basic LLM → rules"]
    J --> J0{"DEEP_RESEARCH_ENABLED ∧ complex?"}
    J0 -->|Yes| J1["Set awaiting_deep_research_consent + pending query; ask consent (with reasoning)"]
    J0 -->|No| K{"Missing slots? (city/dates rules)"}
    J1 -->|await user| E
    K -->|Yes| L1["buildClarifyingQuestion() (LLM → fallback)"]
    L1 --> L2["Return single targeted question"]
    K -->|No| M["setLastIntent(); merge filtered slots; updateThreadSlots()"]

    %% Intent switch → blend or tools
    M --> N{"Intent"}
    N -->|weather| Q["weatherNode() → blendWithFacts()"]
    N -->|destinations| R["destinationsNode() → blendWithFacts()"]
    N -->|packing| S["packingNode() → blendWithFacts()"]
    N -->|attractions| T["attractionsNode() → blendWithFacts()"]
    N -->|web_search| U["webSearchNode()"]
    N -->|system| SYS["systemNode()"]
    N -->|unknown| V["unknownNode() → blendWithFacts()"]

    %% Consent offers inside intents (blend.ts)
    T --> TA{"restaurant query?"}
    TA -->|Yes| TAC["set awaiting_search_consent + pending_search_query; ask consent to web search"]
    TA -->|No| T0["continue"]
    R --> RB{"explicit flight query?"}
    RB -->|Yes| RBC["set awaiting_search_consent + pending_search_query; ask consent to web search"]
    RB -->|No| R0["continue"]

    %% Facts blend and external tools
    Q --> W1["getWeather (Open‑Meteo → fallback Brave) → facts"]
    S --> W1
    R0 --> W1
    R0 --> W3["getCountryFacts (REST Countries → fallback Brave) → facts"]
    R0 --> W4["recommendDestinations (catalog + REST Countries) → facts"]
    T0 --> T2["OpenTripMap → fallback Brave → facts"]

    %% Web search path (router/web_search intent)
    U --> X1["searchTravelInfo (Brave)"]
    X1 --> X2{"Results?"}
    X2 -->|Yes| X3["search_summarize (LLM): 1–3 paragraphs + Sources list"]
    X3 --> X4["Return reply + citations ['Brave Search']"]
    X2 -->|No| X5["Reply: couldn't find relevant info"]

    %% Unknown intent handling (blend.ts)
    V --> V1{"Explicit search?"}
    V1 -->|Yes| U
    V1 -->|No| V2{"Unrelated/System/Edge cases?"}
    V2 -->|Unrelated| V3["Reply: I'm a travel assistant for travel queries"]
    V2 -->|System| SYS
    V2 -->|Emoji/Gibberish/Empty/Very long| V4["Ask for a clearer travel question"]
    V2 -->|Otherwise| L1

    %% Compose final answer (blend.ts)
    W1 --> Y["getPrompt(system/cot/blend) → callLLM"]
    W3 --> Y
    W4 --> Y
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
    I --> Fallbacks["Heuristic routing only when LLM unavailable/low confidence"]
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
