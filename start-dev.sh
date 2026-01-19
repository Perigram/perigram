#!/bin/bash

# Define paths
SESSION_NAME="cutkit"
ROOT_DIR=$(pwd)
export NODE_OPTIONS="--max-old-space-size=4096"

# Check if the tmux session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session '$SESSION_NAME' already exists. Attaching..."
    tmux attach -t "$SESSION_NAME"
    exit 0
fi

# Ensure network exists
docker network create --driver overlay --attachable cutkit-network 2>/dev/null || true

# Start a new tmux session with named window
tmux new-session -d -s "$SESSION_NAME" -n "dev" -c "$ROOT_DIR"

# Window 0: Nuxt application and workers (docker up, all in containers)
tmux send-keys -t "$SESSION_NAME:0" "docker-compose -f docker-compose.dev.yml up --build" C-m

# Window 1: Editor
tmux new-window -t "$SESSION_NAME" -n "vi" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:1" "vi ." C-m

# Window 2: AI / CLI tools
tmux new-window -t "$SESSION_NAME" -n "gemini" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:2" "gemini" C-m

# Attach to the tmux session
tmux attach -t "$SESSION_NAME"
