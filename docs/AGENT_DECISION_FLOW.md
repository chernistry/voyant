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

    %% Transformers-first NLP preprocessing (graph.ts)
    E --> NLP1["classifyContent() (transformers)"]
    NLP1 --> NLP2["detectLanguage() (langdetect)"]
    NLP2 --> NLP3["extractEntitiesEnhanced() (NER)"]
    NLP3 --> NLP4["classifyIntent() (transformers)"]
    
    %% Early content filtering
    NLP1 --> CF1{"Unrelated content?"}
    CF1 -->|Yes| CF2["Reply: I focus on travel planning"]
    CF1 -->|No| CF3{"System question?"}
    CF3 -->|Yes| CF4["Reply: I'm an AI travel assistant"]
    CF3 -->|No| CF5{"Budget query?"}
    CF5 -->|Yes| CF6["Reply: Can't help with budget planning"]
    CF5 -->|No| CF7{"Complex travel query?"}
    CF7 -->|Yes| CF8["Skip destination conflict detection"]
    CF7 -->|No| CF9["Check destination conflicts"]

    %% Language warning
    NLP2 --> LW1{"Non-English or mixed?"}
    LW1 -->|Yes| LW2["Set language warning"]
    LW1 -->|No| LW3["No warning"]

    %% Consent gates before routing
    CF8 --> G{"Awaiting any consent?"}
    CF9 --> G
    G -->|Yes| G1{"Consent type?"}
    G1 -->|Web search| G2["detectConsent() (LLM): yes/no/unclear"]
    G2 -->|yes| H1["optimizeSearchQuery()"]
    H1 --> H2["performWebSearchNode()"]
    H2 --> H2a["summarizeSearchResults → reply + citations ['Brave Search']"]
    G2 -->|no| H3["Reply: No problem..."]
    G1 -->|Deep research| G4["detectConsent() (LLM): yes/no/unclear"]
    G4 -->|yes| G5["performDeepResearchNode()"]
    G5 --> G6["Return deep research reply + citations"]
    G4 -->|no| G7["Fallback: route pending query via router"]
    G -->|No| I["routeIntentNode()"]

    %% Transformers-first routing cascade (router.ts)
    I --> RT1["classifyContent() (transformers)"]
    RT1 --> RT2{"DEEP_RESEARCH_ENABLED?"}
    RT2 -->|Yes| RT3["detectComplexQueryFast()"]
    RT3 --> RT4{"Complex query?"}
    RT4 -->|Yes| RT8["Set awaiting_deep_research_consent"]
    RT4 -->|No| RT9["Continue to routing cascade"]
    RT2 -->|No| RT9
    RT8 --> RT10["Ask for deep research consent"]
    RT10 --> E

    %% NLP Routing Cascade: Transformers → LLM → Rules
    RT9 --> RC1["🔄 ROUTING CASCADE"]
    RC1 --> RC2["Step 1: routeViaTransformersFirst()"]
    RC2 --> RC3["extractEntitiesEnhanced() (NER + patterns)"]
    RC3 --> RC4["classifyIntent() (transformers)"]
    RC4 --> RC5["classifyIntentFromTransformers()"]
    RC5 --> RC6{"Confidence > 0.7?"}
    RC6 -->|Yes| RC7["✅ Transformers success"]
    RC6 -->|No| RC8["Step 2: classifyIntent() + routeWithLLM()"]
    RC8 --> RC9["LLM intent classification + slot extraction"]
    RC9 --> RC10{"LLM confidence > 0.5?"}
    RC10 -->|Yes| RC11["✅ LLM success"]
    RC10 -->|No| RC12["Step 3: Rules fallback"]
    RC12 --> RC13["Pattern-based classification"]

    %% Slot extraction cascade: NER → LLM → Rules
    RC7 --> SE1["extractSlots() cascade"]
    RC11 --> SE1
    RC13 --> SE1
    SE1 --> SE2["parseCity() (NER → LLM → rules)"]
    SE2 --> SE3["parseDate() (NER → LLM → rules)"]
    SE3 --> SE4["parseOriginDestination() (NER → LLM)"]

    %% Missing slots check
    SE4 --> K{"Missing required slots?"}
    K -->|Yes| L1["buildClarifyingQuestion() (LLM → fallback)"]
    L1 --> L2["Return single targeted question"]
    K -->|No| M["setLastIntent(); merge slots; updateThreadSlots()"]

    %% Intent switch → blend or tools
    M --> N{"Intent"}
    N -->|weather| Q["weatherNode() → blendWithFacts()"]
    N -->|destinations| R["destinationsNode() → blendWithFacts()"]
    N -->|packing| S["packingNode() → blendWithFacts()"]
    N -->|attractions| T["attractionsNode() → blendWithFacts()"]
    N -->|policy| P["policyNode() → PolicyAgent (RAG)"]
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

    %% Policy RAG path (graph.ts → policy_agent.ts → tools/vectara.ts)
    P --> P1["pickCorpus(question): transformers → LLM → rules"]
    P1 --> P2["VectaraClient.query(corpus): semantic search + citations"]
    P2 --> P3{"Summary available?"}
    P3 -->|Yes| P4["Use Vectara summary"]
    P3 -->|No| P5["Summarize hits via LLM (callLLM)"]
    P4 --> P6["formatPolicyAnswer() with numbered Sources"]
    P5 --> P6
    P6 --> P7{"Any citations/snippets?"}
    P7 -->|Yes| P8["Return reply + citations ['Internal Knowledge Base' titles]"]
    P7 -->|No| P9["Set awaiting_web_search_consent + pending_web_search_query; ask to search web"]
    P9 --> E

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
    Z6 --> Z7{"Language warning set?"}
    Z7 -->|Yes| Z8["Prefix: 'Note: I work best with English, but I'll try to help.'"]
    Z7 -->|No| Z9["No warning"]
    Z8 --> Z10["Return final reply (+ citations if any)"]
    Z9 --> Z10

%% Key Changes in Transformers-First Architecture:
%% 
%% 1. NLP PREPROCESSING (graph.ts):
%%    - classifyContent() (transformers) for content classification
%%    - detectLanguage() (langdetect) for language detection
%%    - extractEntitiesEnhanced() for enhanced entity extraction with MONEY/TIME/DURATION entities
%%    - classifyIntent() (transformers) for intent classification
%%
%% 2. ROUTING CASCADE (router.ts):
%%    - Transformers → LLM → Rules fallback with timeout via TRANSFORMERS_ROUTER_TIMEOUT_MS
%%    - Enhanced NER with confidence scoring and deduplication
%%    - Pattern-based classification with multilingual support
%%    - Intent classification using Transformers.js models
%%
%% 3. COMPLEXITY DETECTION:
%%    - Transformers-based complexity detection with constraint analysis
%%    - Entity count + constraint categories for complex queries
%%    - Confidence scoring for complexity assessment
%%    - DEEP_RESEARCH_ENABLED flag to enable/disable complexity detection
%%
%% 4. SLOT EXTRACTION CASCADE:
%%    - NER → LLM → Rules for city/date/entity extraction
%%    - Enhanced entity types: LOCATION, DATE, MONEY, DURATION, PERSON, ORGANIZATION
%%    - Confidence-based fallback between methods with deduplication
%%    - Pattern-based detection for MONEY and DURATION entities
%%
%% 5. PERFORMANCE OPTIMIZATIONS:
%%    - Early content filtering reduces LLM calls
%%    - Transformers-first reduces latency by 20-40%
%%    - Cached model loading for repeated requests
%%    - Per-turn memoization for NER/CLS/LLM results
%%    - Timeout-based routing cascade with Transformers.js
%%
%% Environment Variables:
%% - TRANSFORMERS_ROUTER_TIMEOUT_MS: Transformers timeout (default: 3000ms)
%% - DEEP_RESEARCH_ENABLED: Enable complexity detection (true/false)
%% - TRANSFORMERS_NER_MODEL: NER model override
%% - NER_MODE: local|remote|auto (default: auto)
%% - CLASSIFICATION_INTENT_MODEL_LOCAL: Local intent classification model
%% - CLASSIFICATION_INTENT_MODEL_REMOTE_API: Remote API intent classification model
%% - RESILIENCE: Circuit breakers and rate limiters are used for all external API calls.
