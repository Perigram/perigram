#!/bin/bash

# Define paths
SESSION_NAME="cutkit"
ROOT_DIR=$(pwd)

# Check if the tmux session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session '$SESSION_NAME' already exists. Attaching..."
    tmux attach -t "$SESSION_NAME"
    exit 0
fi

# Ensure Mongo is running
if ! docker ps | grep -q nest2d_mongo; then
    echo "Starting MongoDB container..."
    mkdir -p .mongo-data
    docker run -d --name nest2d_mongo -p 27017:27017 --user "$(id -u):$(id -g)" -v "$ROOT_DIR/.mongo-data":/data/db mongo
fi

# Start a new tmux session with named window
tmux new-session -d -s "$SESSION_NAME" -n "dev" -c "$ROOT_DIR"

# Window 0: Nuxt application
tmux send-keys -t "$SESSION_NAME:0" "npm run dev" C-m

# Window 1: Editor
tmux new-window -t "$SESSION_NAME" -n "vi" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:1" "vi ." C-m

# Window 2: AI / CLI tools
tmux new-window -t "$SESSION_NAME" -n "cli" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:2" "echo 'Ready for CLI commands'" C-m

# Window 3: Workers & Logs
tmux new-window -t "$SESSION_NAME" -n "workers" -c "$ROOT_DIR"
tmux send-keys -t "$SESSION_NAME:3" "docker stack deploy -c docker-stack-external.yml nest2d" C-m
tmux send-keys -t "$SESSION_NAME:3" "docker service ls" C-m

# Attach to the tmux session
tmux attach -t "$SESSION_NAME"
