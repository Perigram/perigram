#!/usr/bin/env bash
# Zero-agent watcher. Pure bash: logs state, desktop-notifies on actionable events.
# All graph actions happen in the main dialog when the owner pings.
set -u
export PATH="/home/isuo/.nvm/versions/node/v24.15.0/bin:$PATH"
REPO=/home/isuo/Projects/cutkit-demo
WT=$REPO/../cutkit-demo-agent-producer-workflows-20260822-004019
BRANCH=agent/producer-workflows-20260822-004019
LOG=$REPO/.opencode/watch-langgraph.log
EVENT=$REPO/.opencode/watch-EVENT
POLL=300
STALL_MIN=45
TOTAL_TICKS=22

log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG"; }
notify(){ command -v notify-send >/dev/null && notify-send -u critical "cutkit watcher" "$1"; echo "$1" > "$EVENT"; log "EVENT $1"; }

snapshot(){
  local dirty=0 ahead=0 merged=n wt=y ticks=0 tip=none
  [ -d "$WT" ] && dirty=$(git -C "$WT" status --porcelain 2>/dev/null | wc -l) || wt=n
  tip=$(git -C "$REPO" rev-parse "$BRANCH" 2>/dev/null || echo none)
  if [ "$tip" != none ]; then
    ahead=$(git -C "$REPO" rev-list --count local.."$BRANCH" 2>/dev/null || echo 0)
    if [ "$ahead" -gt 0 ] && git -C "$REPO" merge-base --is-ancestor "$BRANCH" local 2>/dev/null; then merged=y; fi
  else wt=n; fi
  ticks=$(sed -n '/^### Correction: Producer-scoped entity workflows/,/^## Required acceptance matrix/p' \
            "$REPO/TODO-process-designer.md" 2>/dev/null | grep -c '^\s*- \[x\]')
  echo "wt=$wt dirty=$dirty ahead=$ahead merged=$merged ticks=$ticks"
}

log "zero-agent watcher started pid $$ poll=${POLL}s stall=${STALL_MIN}min"
stall_start=""; last_snap="init"
while true; do
  cur=$(snapshot); now=$(date +%s)
  if [ "$cur" != "$last_snap" ]; then
    log "STATE $cur"; last_snap="$cur"; stall_start=$now
    case "$cur" in
      *merged=y*|*"ticks=$TOTAL_TICKS"*) notify "FINISHED+merged — ping the dialog to launch next section";;
    esac
  elif [ -z "$stall_start" ]; then stall_start=$now; fi

  age=$(( now - ${stall_start:-$now} ))
  if [ "$age" -ge $((STALL_MIN*60)) ] && [ ! -f "$EVENT" ]; then
    notify "STALLED ${STALL_MIN}min no progress ($cur) — ping the dialog to repair"
    stall_start=$now   # re-arm; EVENT file prevents repeat spam until cleared
  fi
  sleep "$POLL"
done