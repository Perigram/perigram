#!/bin/bash
set -e

echo "🚀 Starting CutKit Image Build Process..."

# 1. Main App
echo "📦 Building Main App..."
docker build -t ghcr.io/1suo/cutkit-app:latest .

# 2. File Processing Worker
echo "📦 Building File Processing Worker..."
docker build -t ghcr.io/1suo/file-processing-worker:latest -f workers/fileprocessing/Dockerfile .

# 3. Nesting Worker
echo "📦 Building Nesting Worker..."
docker build -t ghcr.io/1suo/nesting-worker:latest -f workers/nesting/Dockerfile .

# 4. Cassette Processing Worker
echo "📦 Building Cassette Processing Worker..."
docker build -t ghcr.io/1suo/cassette-processing-worker:latest -f workers/cassette-processing/Dockerfile .

echo "✅ All images built successfully!"
echo "To push them to your registry, run:"
echo "  docker push ghcr.io/1suo/cutkit-app:latest"
echo "  docker push ghcr.io/1suo/file-processing-worker:latest"
echo "  docker push ghcr.io/1suo/nesting-worker:latest"
