#!/bin/bash
# RuvVector Service Startup Script

set -e

echo "Starting RuvVector Service..."

# Check if build exists
if [ ! -d "dist" ]; then
  echo "Build not found. Running npm run build..."
  npm run build
fi

# Set default port if not set
export RUVVECTOR_SERVICE_PORT=${RUVVECTOR_SERVICE_PORT:-3100}

# Start the service
echo "Starting service on port $RUVVECTOR_SERVICE_PORT..."
exec node dist/index.js
