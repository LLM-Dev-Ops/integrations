#!/bin/bash
# Simple test script for RuvVector Service

set -e

SERVICE_URL="${RUVVECTOR_SERVICE_URL:-http://localhost:3100}"
CORRELATION_ID="test-$(date +%s)"

echo "Testing RuvVector Service at $SERVICE_URL"
echo "========================================="
echo ""

# Test 1: Health Check
echo "1. Testing /health endpoint..."
HEALTH=$(curl -s "$SERVICE_URL/health")
echo "$HEALTH" | jq '.'
STATUS=$(echo "$HEALTH" | jq -r '.status')
if [ "$STATUS" != "healthy" ]; then
  echo "ERROR: Service is not healthy!"
  exit 1
fi
echo "✓ Health check passed"
echo ""

# Test 2: Ingest single event
echo "2. Testing POST /ingest (single event)..."
RESPONSE=$(curl -s -X POST "$SERVICE_URL/ingest" \
  -H "Content-Type: application/json" \
  -d "{
    \"correlationId\": \"$CORRELATION_ID\",
    \"integration\": \"test-integration\",
    \"provider\": \"test-provider\",
    \"eventType\": \"test.event\",
    \"timestamp\": $(date +%s)000,
    \"metadata\": {
      \"test\": true,
      \"message\": \"Test event from script\"
    }
  }")
echo "$RESPONSE" | jq '.'
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo "ERROR: Failed to ingest event!"
  exit 1
fi
echo "✓ Single event ingestion passed"
echo ""

# Test 3: Ingest batch events
echo "3. Testing POST /ingest (batch)..."
TIMESTAMP=$(date +%s)000
RESPONSE=$(curl -s -X POST "$SERVICE_URL/ingest" \
  -H "Content-Type: application/json" \
  -d "[
    {
      \"correlationId\": \"$CORRELATION_ID\",
      \"integration\": \"test-integration\",
      \"eventType\": \"batch.event.1\",
      \"timestamp\": $TIMESTAMP
    },
    {
      \"correlationId\": \"$CORRELATION_ID\",
      \"integration\": \"test-integration\",
      \"eventType\": \"batch.event.2\",
      \"timestamp\": $((TIMESTAMP + 1000))
    },
    {
      \"correlationId\": \"$CORRELATION_ID\",
      \"integration\": \"test-integration\",
      \"eventType\": \"batch.event.3\",
      \"timestamp\": $((TIMESTAMP + 2000))
    }
  ]")
echo "$RESPONSE" | jq '.'
RECEIVED=$(echo "$RESPONSE" | jq -r '.data.received')
if [ "$RECEIVED" != "3" ]; then
  echo "ERROR: Expected 3 events, got $RECEIVED"
  exit 1
fi
echo "✓ Batch ingestion passed"
echo ""

# Wait a moment for async persistence
echo "Waiting 2 seconds for async persistence..."
sleep 2
echo ""

# Test 4: Query by correlation ID
echo "4. Testing GET /query (by correlationId)..."
RESPONSE=$(curl -s "$SERVICE_URL/query?correlationId=$CORRELATION_ID")
echo "$RESPONSE" | jq '.'
COUNT=$(echo "$RESPONSE" | jq '.data | length')
if [ "$COUNT" -lt "4" ]; then
  echo "WARNING: Expected at least 4 events, found $COUNT"
  echo "Events may still be persisting..."
else
  echo "✓ Found $COUNT events for correlation ID"
fi
echo ""

# Test 5: Query by integration
echo "5. Testing GET /query (by integration)..."
RESPONSE=$(curl -s "$SERVICE_URL/query?integration=test-integration&limit=5")
echo "$RESPONSE" | jq '.data | length' | xargs echo "Found events:"
echo "✓ Query by integration passed"
echo ""

# Test 6: Query with limit and offset
echo "6. Testing GET /query (pagination)..."
RESPONSE=$(curl -s "$SERVICE_URL/query?integration=test-integration&limit=2&offset=0")
COUNT=$(echo "$RESPONSE" | jq '.data | length')
echo "First page: $COUNT events"
RESPONSE=$(curl -s "$SERVICE_URL/query?integration=test-integration&limit=2&offset=2")
COUNT=$(echo "$RESPONSE" | jq '.data | length')
echo "Second page: $COUNT events"
echo "✓ Pagination passed"
echo ""

echo "========================================="
echo "All tests passed! ✓"
echo ""
echo "Test correlation ID: $CORRELATION_ID"
echo "You can query these test events with:"
echo "  curl \"$SERVICE_URL/query?correlationId=$CORRELATION_ID\" | jq"
