# Voyant Travel Assistant

Builds trust, then answers fast.

![Voyant Travel Assistant Screenshot](./assets/screenshot.png)

Short, production‑minded demo of a travel assistant: LLM for NLP, API‑first facts (Open‑Meteo, REST Countries, OpenTripMap), consented web/deep search fallback, strict guardrails (no fabricated citations), receipts + self‑check, metrics, and clean CLI/HTTP interfaces.

## Quick Start
```bash
npm install

# CLI
npm run cli

# HTTP server
npm run dev
```

## Minimal Config
- LLM: set one of `OPENROUTER_API_KEY` or `LLM_PROVIDER_BASEURL` + `LLM_API_KEY` (+ optional `LLM_MODEL`).
- Optional external: `BRAVE_SEARCH_API_KEY`, `OPENTRIPMAP_API_KEY`.
- Flags: `METRICS=json|prom`, `DEEP_RESEARCH_ENABLED=true`, `SEARCH_SUMMARY=on`.

## Highlights
- 4 intents (weather, packing, destinations, attractions) with context and targeted clarifiers.
- API‑first facts with receipts and self‑verification; no fake citations.
- Web/deep search only with user consent; query optimizer reduces noise.
- Resilience: timeouts, retries with jitter, host allowlist, `/metrics` (Prom/JSON), per‑host circuit breaker + rate limiting.

## Roadmap (selected)
- Policy RAG (Vectara) with citations: implemented behind env (off by default). Add 3–5 policy docs; see docs/VECTARA_SETUP.md.
- Parallel branches + rollbacks: current graph is linear for debuggability; interfaces ready for LangGraph/xstate merge.
- Circuit breaker + rate limits: implemented (opossum + Bottleneck). Future: per‑adapter tuning docs and presets.
- Browser policy mode: future—evidence via Playwright screenshots/snippets in receipts.
- Interview‑grade demos: IRROPS and partial‑leg change scripted flows with transcripts.

## Agent Decision Flow

See docs/AGENT_DECISION_FLOW.md for the current routing/consent/RAG diagram.

---

Demo page: [View Live Demo](https://chernistry.github.io/voyant/) for a guided tour and sample transcripts.
