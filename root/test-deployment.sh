#!/bin/bash

# Test deployment script for Voyant Travel Assistant
# Usage: ./test-deployment.sh <base-url>

BASE_URL=${1:-"http://localhost:3000"}

echo "🧪 Testing deployment at: $BASE_URL"
echo "=================================="

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/healthz" | jq '.' || echo "❌ Health check failed"
echo ""

# Test basic chat
echo "2. Testing basic chat..."
curl -s -X POST "$BASE_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Weather in Paris?"}' | jq '.reply' || echo "❌ Chat test failed"
echo ""

# Test with thread ID
echo "3. Testing chat with thread ID..."
curl -s -X POST "$BASE_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What to pack?", "threadId": "test-1"}' | jq '.reply' || echo "❌ Thread test failed"
echo ""

# Test receipts
echo "4. Testing receipts..."
curl -s -X POST "$BASE_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Weather in Tokyo?", "receipts": true}' | jq '.receipts' || echo "❌ Receipts test failed"
echo ""

echo "✅ Deployment tests completed!"
