# COMPONENT: Calls

PrimeVue-native conferencing surfaces over the self-hosted LiveKit service
and the connections layer. There is no LiveKit default chrome and no React
component suite — every surface is built from shared primitives, semantic
tokens, and `livekit-client` (lazily imported, so the WebRTC stack never
enters the main bundle).

- `CallPanel.vue` orchestrates the call: pre-join → connected stages, the
  room event wiring (tracks, mute, speaking levels, connection quality,
  reconnection), speaker/grid layouts with pinning and screen-share
  spotlight, the reaction bar (data-channel events, floating badges through
  the `riseAndFade` motion pattern), raise-hand, mid-call device settings,
  and mic/camera/share/leave controls.
- `CallPrejoin.vue` owns device enumeration, live camera preview, a
  microphone level meter, and mic/cam pre-toggles carried into the join.
- `CallTile.vue` renders one participant or screen-share track: video or
  Avatar fallback, speaking level dot, mute/hand/quality badges, and pin.
- `CallWorkspacePage.vue` is the pane-hosted call surface used by the home
  workspace: the `CallPanel` stage plus the call's own conversation thread
  (`ChatSupport` embedded and pinned through its `conversation-key` prop,
  meet-style stage + chat), with a pop-out control that hands the live call
  to the shell's floating window and closes the tab. It is responsive to
  the pane width through a
  container query: wide panes render the chat as a fixed side rail; narrow
  or split panes stack it below the stage at two-fifths of the call
  height, internally scrollable so the stage keeps the remaining share. Direct and group calls show
  their persistent app chat; org-room calls render stage-only. The
  floating drawer/mobile surfaces keep the full-screen call dialog.
- `IncomingCalls.vue` is the global ring surface: floating invite cards
  (Join/Decline) mounted by the app shell for every authenticated user.
  Only *new* calls float; ongoing rooms are listed in the home sidebar and
  in chats. Joining opens the call as a home workspace tab (mobile keeps
  the full-screen dialog).
- `CallFloatingWindow.vue` is the absolute floating call window: a draggable
  fixed panel above the app that hosts a popped-out `CallPanel`. Docking
  returns the call to a home workspace tab.

## Call line state machine

The user's call is one explicit machine in `stores/calls.js`, so every
surface agrees on ringing:

```
idle ──invite──▶ ringing ──accept──▶ joining ──CallPanel connected──▶ in-call
  ▲                 │                                   │               │
  └─ decline/TTL ───┘◄───────────────────────────────────┴─── leave ─────┘
```

`acceptInvite` is a single global transition — accepting or declining in
any surface clears the ring for that room everywhere (the old per-surface
ring banners kept ringing after an accept elsewhere). `CallPanel` reports
`joinRoom`/`leaveRoom`, and joining also stops any remaining ring for the
room.

The machine tracks the local user's own participation; the room lifecycle
— alive while *anyone* is in it — rides the activity snapshot: webhook
`call.activity` events debounce into an `active-rooms` refetch that the
server filters to rooms with at least one participant, and that snapshot
drives the sidebar rows and the chat ongoing-call banner. Ringing is
room-scoped as well: each refreshed snapshot drops invites whose room is
no longer running (with a grace window so a snapshot taken just before an
invite cannot dismiss it), so a caller hanging up before the callee
answers stops the ring immediately instead of waiting out the 30s TTL.

Surface transfers keep the WebRTC connection alive: popping a call out of
its workspace tab (or docking a floating call back) marks the room as
transferring; the unmounting `CallPanel` strips its listeners and parks
the live room in the store, and the adopting panel rebinds the same
events, rebuilds tiles from the current participants/publications, and
continues the call without reconnecting.

## Surface routing

`composables/useCallRouting.js` owns where a call opens: the home
workspace tab is the default (navigating home when the caller lives on
another route); organizations without a generated home workspace fall back
to the floating window, and mobile keeps the full-screen dialog. Accepted
invites and docked calls are parked as `pendingTabRoom` and consumed by
the home workspace's watcher.

## Media plumbing

- Remote audio must be attached to an element to play: subscribed audio
  tracks are attached through LiveKit's `track.attach()` into a hidden
  sink container inside the panel and detached on unsubscribe/disconnect.
  Attached elements register with the room, so the speaker device switch
  (`room.switchActiveDevice('audiooutput', …)`) keeps working. Local mic
  audio is never played back locally.
- Video attachment is idempotent and stable: `CallTile` emits its video
  element only when the element actually changes, and `CallPanel` skips
  `srcObject` resets for elements already playing the track — resetting
  the stream on every re-render is what made tiles flicker. Tiles are
  patched in place instead of replaced, so audio-level ticks do not
  re-render every surface.
- The speaker spotlight is sticky: pinning and screen shares take it
  immediately, but a new dominant speaker must hold the top audio level
  for ~1.2s before the spotlight follows, otherwise per-tick level
  changes would bounce (and remount) the spotlight tile mid-sentence.

## Layouts

- Speaker view: one large spotlight plus a film strip (side strip on wide
  containers through a container query). Spotlighted screen shares hug
  their live source proportions — `CallTile` reports the video's aspect
  from the element's own resize events and the tile caps itself to the
  stage box — while cameras fill the stage (`object-cover`).
- Grid view is a self-fitting masonry: `repeat(auto-fit, minmax(min(100%,
  14rem), 1fr))` with fixed-aspect 16:9 cells, so the participant count and
  the pane width choose the column count together and the grid never
  produces collapsed columns.
- Screen shares render `object-contain`; cameras `object-cover`.
  `CallPanel` itself carries no chat — app chat owns messaging; the panel
  only emits `closed` so hosts can tear the surface down. Recording/egress
  is not wired; it needs server-side LiveKit egress configuration first.

## Call activity surfaces

Room activity is owned by the shared `calls` store
(`stores/calls.js`): it subscribes once per app to `call.invite` on the
user topic and `call.activity` on the user/org topics, keeps the
`/api/livekit/active-rooms` snapshot fresh, and exposes incoming invites
(30s TTL). Consumers:

- the app shell mounts `IncomingCalls` for ring notifications;
- the generated home sidebar lists ongoing rooms as persistent rows under
  the communication menu (label, participant count, row click joins) —
  not inside the Calls flyout, which lists ringable conversations;
- `ChatSupport` shows an ongoing-call banner with a Join button for the
  open conversation, before joining and after leaving the call.

Room↔conversation mapping helpers (`utils/call-rooms.js`) mirror the
server's derived room-name contract so every surface agrees which
conversation a room belongs to.

Room access, tokens, invites, and webhooks are owned by the
[livekit feature](../../server/features/livekit/README.md).
