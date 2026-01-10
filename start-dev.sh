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

# Window 0: Nuxt application
tmux send-keys -t "$SESSION_NAME:0" "npm run dev" C-m

# Window 1: Editor
tmux new-window -t "$SESSION_NAME" -n "vi" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:1" "vi ." C-m

# Window 2: AI / CLI tools
tmux new-window -t "$SESSION_NAME" -n "cli" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:2" "copilot --allow-all-tools" C-m

# Window 3: Workers & Logs
tmux new-window -t "$SESSION_NAME" -n "workers" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:3" "docker stack deploy -c docker-stack-external.yml cutkit" C-m
tmux send-keys -t "$SESSION_NAME:3" "docker service ls" C-m

# Attach to the tmux session
tmux attach -t "$SESSION_NAME"
