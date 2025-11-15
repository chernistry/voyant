```mermaid
flowchart TD
  U["User message"] --> SYS["meta_agent.md<br/>System prompt"]
  SYS --> PLAN["Planning request (LLM)<br/>CONTROL JSON route/missing/calls"]
  PLAN --> ACT["chatWithToolsLLM<br/>Meta Agent execution"]
  ACT --> BLEND["Blend instructions<br/>within meta_agent.md"]
  BLEND --> RECEIPTS["Persist receipts<br/>slot_memory.setLastReceipts"]
  RECEIPTS --> VERQ{"Auto-verify or /why?"}
  VERQ -->|Yes| VERIFY["verify.md<br/>STRICT JSON verdict"]
  VERIFY --> OUT["Reply + receipts"]
  VERQ -->|No| OUT
```

Prompt Inventory
- **meta_agent.md** — single governing super-prompt (Analyze → Plan → Act → Blend).
  Embeds routing guidance, policy/RAG rules, consent logic, groundedness guardrails,
  ledger expectations, and tool schemas.
  The current routes include: weather, packing, attractions, destinations, flights, hotels, policy, web, irrops, system.
- **Planning CONTROL block** — inline system hints issued by `callChatWithTools`
  (no separate file). Produces strict JSON with `route`, `confidence`, `missing`,
  `consent`, and `calls` array.
- **complexity_assessor.md** — optional helper prompt to annotate
  complexity/budget for planning (only when enabled).
- **verify.md** — STRICT JSON verifier for auto-verify and `/why` fallback
  (pass/warn/fail, confidence, notes, scores, revised answer).
- Legacy multi-prompt assets were removed during the Big LLM refactor; the
  meta_agent.md governs the end-to-end flow.
