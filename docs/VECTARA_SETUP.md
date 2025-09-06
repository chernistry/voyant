# Vectara RAG Setup Guide

## 1. Setting up Vectara Account

1. Go to https://console.vectara.com/
2. Create an account or sign in
3. Create 3 corpora:
   - `navan-airlines` (for airlines)
   - `navan-hotels` (for hotels)
   - `navan-visas` (for visas)

## 2. Obtaining API Keys

1. In Vectara console, go to **API Keys**
2. Create a new API key with permissions:
   - `query` (for searching)
   - `index` (for document uploads)
3. Copy:
   - API Key
   - Customer ID
   - Corpus IDs for each corpus

## 3. Setting up Environment Variables

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

Update in `.env`:
```bash
# Vectara Configuration
VECTARA_API_KEY=vtr-xxx-your-api-key-here
VECTARA_CUSTOMER_ID=your-customer-id
VECTARA_CORPUS_AIRLINES=airlines-corpus-id
VECTARA_CORPUS_HOTELS=hotels-corpus-id
VECTARA_CORPUS_VISAS=visas-corpus-id
POLICY_RAG=on
```

## 4. Loading Test Documents

Run the upload script:

```bash
npm run ingest-policies
```

This will load test documents:

### Airlines corpus:
- `united-baggage.txt` - United Airlines baggage policy
- `delta-cancellation.txt` - Delta cancellation policy

### Hotels corpus:
- `marriott-cancellation.txt` - Marriott cancellation policy
- `hilton-checkin.txt` - Hilton check-in policy

### Visas corpus:
- `usa-esta.txt` - ESTA requirements for USA
- `schengen-requirements.txt` - Schengen requirements

## 5. Testing Functionality

Run test queries:

```bash
npm run test-vectara
```

Or test manually through CLI:

```bash
npm run cli
```

Example queries:
- "What is United baggage allowance?"
- "Delta cancellation policy within 24 hours"
- "Marriott hotel cancellation fee"
- "Do I need visa for Europe from USA?"

## 6. Testing via API

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is United carry-on baggage size limit?", "threadId": "test1"}'
```

## Troubleshooting

### Error "vectara_disabled"
- Check `VECTARA_API_KEY` in `.env`
- Make sure `POLICY_RAG=on`

### Error "vectara_corpus_missing"
- Check corpus IDs in `.env`
- Make sure corpora are created in console

### Error "host_not_allowed"
- `api.vectara.io` is already added to allowlist
- Check that you're using correct BASE_URL

### Empty results
- Make sure documents are loaded (`npm run ingest-policies`)
- Check in Vectara console that documents are indexed
- Try simpler queries

## File Structure

```
data/policies/
├── airlines/
│   ├── united-baggage.txt
│   └── delta-cancellation.txt
├── hotels/
│   ├── marriott-cancellation.txt
│   └── hilton-checkin.txt
└── visas/
    ├── usa-esta.txt
    └── schengen-requirements.txt

scripts/
├── vectara-ingest.ts    # Document upload
└── vectara-test.ts      # Query testing
```
