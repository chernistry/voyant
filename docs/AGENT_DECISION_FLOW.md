
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
    J --> Jp{"Policy content? (content_type=policy)"}
    Jp -->|Yes| Jp1["intent='policy' (needExternal=true)"]
    Jp -->|No| J0{"DEEP_RESEARCH_ENABLED ∧ complex?"}
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
    Z6 --> Z7{"Mixed languages?"}
    Z7 -->|Yes| Z8["Prefix warning"]
    Z7 -->|No| Z9["No warning"]
    Z8 --> Z10["Return final reply (+ citations if any)"]
    Z9 --> Z10

    %% Fallbacks
    I --> Fallbacks["Heuristic routing only when LLM unavailable/low confidence"]
    P -->|Vectara disabled or error| U

%% Notes
%% - Policy RAG is gated by env: POLICY_RAG=on or VECTARA_API_KEY set (see docs/VECTARA_SETUP.md).
%% - Router marks policy intent via content classification (policy) or heuristics (baggage, cancellation, visa...).
%% - If policy RAG returns no snippets, we ask for web search consent using awaiting_web_search_consent.
%% - Deep research consent is offered when DEEP_RESEARCH_ENABLED=true and query classified complex.
%% - Budget queries prefix a disclaimer before destinations answers (graph.ts).
