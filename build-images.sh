#!/bin/bash
set -e

echo "🚀 Starting Perigram Image Build Process..."

# 1. Main App
echo "📦 Building Main App..."
docker build -t ghcr.io/1suo/perigram-app:latest .

# 2. Nesting Worker (the HTTP 2D solver the nesting.solve command calls)
echo "📦 Building Nesting Worker..."
docker build -t ghcr.io/1suo/nesting-worker:latest -f workers/nesting/Dockerfile .

echo "✅ All images built successfully!"
echo "To push them to your registry, run:"
echo "  docker push ghcr.io/1suo/perigram-app:latest"
echo "  docker push ghcr.io/1suo/nesting-worker:latest"
