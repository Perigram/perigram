#!/bin/bash
set -e

echo "🚀 Starting CutKit Image Build Process..."

# 1. Main App
echo "📦 Building Main App..."
docker build -t ghcr.io/1suo/cutkit-app:latest .

# 2. File Processing Worker
echo "📦 Building File Processing Worker..."
cd workers/fileprocessing
docker build -t ghcr.io/1suo/file-processing-worker:latest .
cd ../..

# 3. Nesting Worker
echo "📦 Building Nesting Worker..."
cd workers/nesting
docker build -t ghcr.io/1suo/nesting-worker:latest .
cd ../..

echo "✅ All images built successfully!"
echo "To push them to your registry, run:"
echo "  docker push ghcr.io/1suo/cutkit-app:latest"
echo "  docker push ghcr.io/1suo/file-processing-worker:latest"
echo "  docker push ghcr.io/1suo/nesting-worker:latest"
