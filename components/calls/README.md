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
  meet-style stage + chat). It is responsive to the pane width through a
  container query: wide panes render the chat as a fixed side rail; narrow
  or split panes stack it below the stage at two-fifths of the call
  height, internally scrollable so the stage keeps the remaining share. Direct and group calls show
  their persistent app chat; org-room calls render stage-only. The
  floating drawer/mobile surfaces keep the full-screen call dialog.
- `IncomingCalls.vue` is the global ring surface: floating invite cards
  (Join/Decline) mounted by the app shell for every authenticated user.
  Only *new* calls float; ongoing rooms are listed in the home sidebar and
  in chats. Joining opens the full-screen call dialog.

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
- the generated home sidebar lists ongoing rooms as persistent rows
  (label, participant count, row click joins) directly under the
  communication menu — not inside the Calls popup submenu;
- `ChatSupport` shows an ongoing-call banner with a Join button for the
  open conversation, before joining and after leaving the call.

Room↔conversation mapping helpers (`utils/call-rooms.js`) mirror the
server's derived room-name contract so every surface agrees which
conversation a room belongs to.

Room access, tokens, invites, and webhooks are owned by the
[livekit feature](../../server/features/livekit/README.md).
