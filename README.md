# Voyant Travel Assistant

Voyant is a travel assistant with one disciplined meta-agent instead of a committee in a trench coat.
It plans tool calls, executes them, stores receipts, and verifies the answer before speaking too confidently.

## Quick Start

Run `cd root && npm install && npm run build && npm run start` for the API, or `cd root && npm run cli` for the terminal flow.
Minimum env is `LLM_PROVIDER_BASEURL` plus `LLM_API_KEY` or `OPENROUTER_API_KEY`; travel and search keys stay optional until you need those tools.

## How It Works

The meta-agent analyzes the request, picks tools, executes them asynchronously, blends the response, then records receipts and optional verification artifacts.
The result is a fast travel workflow with provenance, which is more useful than eloquence on its own.

## Perks

- One-agent orchestration with strict JSON control instead of vague tool chaos.
- Receipts and `/why`-style verification for answers that need to stand up later.
- Resilient I/O, explicit timeouts, and a test suite that leans toward real conversations.

Built by Alex Chernysh — alex@hireex.ai
