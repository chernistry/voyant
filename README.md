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
- Resilience: timeouts, retries with jitter, host allowlist, `/metrics` (Prom/JSON).

## Deliberate Tradeoffs → Roadmap
- Policy RAG with anchored citations: intentionally out‑of‑scope for assignment; add 3–5 policy docs with paragraph‑level cites.
- Parallel branches + rollbacks: kept graph linear for debuggability; interfaces are ready for LangGraph/xstate merge.
- Circuit breaker + rate limits: today uses timeouts/backoff/Retry‑After; add per‑adapter breaker and Bottleneck quotas.
- Browser policy mode: move from aggregate deep research to Playwright evidence (screenshots/snippets) in receipts.
- Interview‑grade demos: IRROPS and partial leg change scripted flows with transcripts.

## Agent Decision Flow

🔗 Interactive diagram:
[View Agent Decision Flow](https://www.mermaidchart.com/play#pako:eNq1V91SGzcUfpUzzHQw0ybmL3-kk4wxjoEASWxjwCHDyLuyvY1W2qy0GDdkJled3rZ9iL5XnqTnSPJqDWRKL8oNs_LR0Xe-8_95KVIxX9paOpcjoabRhOUGejvnEvCv8f586VjzHA651mzMz5c-wIMHL6Cx-vl8qZVmZlbnqfolqY-T4ZDniZ68PF_64u-ukuj1GdfX0FhDRR2eidkWNPRHGKkcGESCsxxMzi65gE8F1yZREp9YuH-krmEbb0-YjAVvTpiprZQy2xZN8zMpj3iSGQ0pWvMSavXpZAb4Su7PV0pczQCrQ7AOFItBMG1KWRjlKgUtlIEUzctn5XudNftgZx3vDYtExPNnux-54EbJCrbOupPdQNlL5GY0a0g95XltBWoHB4ew331zVJHecNKblihT5LKE80BJMcMvZK8Ub5bc7OCFrNAT76GameScxXtxUL1jNbdQLi9kO2fZpIfqa6m78BMs3nB3fvgBmkpqLg2MmeEahhx9xiFXhUnk2Am1rOI2st-YsoTOYcqHoNGr0QQidz8ERDsQ3ybiY254ZPwznpWVLZhxXZeqXkgbHqUVbUv99Yyu79J1lZkkTX7lXfvcu4Lnswr7u85Tu-SpjOcIPj3hQyd7hCFSFV33ogxldZGmLC_VdrguBEbEt9_-dB6AHyFKDKNI1fB-eZuCF5zs8oebYCX6Z3cjhP6RgixXQ8HThw8fBuHSl-3NKpcx5xk--l06Nyt8PvrvfD4KfLYfB5Z28NWOf_QGUe3HzuFPQowuYrzF0M3XiJD2U7z-igkxZNHHLRtRHDIuY7L5E7kRLhPmzitwN0uW9iiS6dc9adDSCsgydjsuTAFrhs1jDTWn7yFVAiu1Z23ZX9RVW9n6eZi_eICliWmNKYts0jnZ5E-coCPXyfIrLGGR6bp30PZZPWZkE8uxdGovpU2eRAYo8x0UG1NDppPIHtoIKwQPnO07hFRqd1qttxedVrfV6DR3L1pHje2D1g58-_1vDIs0E_wqhMV-pezuU550uQHmY-qC_HUx99eFjym0boH_58CwRs9_rE0TQ65lWkkUCeGwHwr0a8R4mCA_qMLy_bJChHZ2hQq877LDgoICObqGlvvldcB-sDavsU3BqHqi7ne-R8xLKHE28pEUcB241D9YD2FKwAQHw_IxJkl8u9m8Lk05pCLAzQE2hHlMPMc2gBdhlAj0G_ch9RyKjMzr2fJpvX8zDH2saGQQs8P6WyDR1JeMUkI7wUML9wgpdPIlT0cW1JQzMyGO3iEy_-FiPmg8QRe9whjUlWx1t2MyVLpsxIZny0Q4ub-eDClGEq-hS6XCfdz_NjM2RRyIHmqoHNxfCzaXCxe513Bsybi7oDtpPdOGpwj4jCC7rzsFC_lRqqm8hj7K-Y9_A3WrS6rRCHMdEqmTmOM_ciRWA3s5FJ2edXWvgb7GJDSsyBnetUkXMrjXCFnQazRdPIYU_l7uzn-4I4WNqjTm0nr_DgV9bxVfQWl8oOBhJnEjyTai5VeZSDCjYSSS8eQ)

---

Demo page: [View Live Demo](https://chernistry.github.io/voyant/) for a guided tour and sample transcripts.
