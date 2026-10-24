# COMPONENT: Calls

PrimeVue-native conferencing surfaces over the self-hosted LiveKit service
and the connections layer, built from shared primitives, semantic tokens,
and `livekit-client` (lazily imported; the WebRTC stack rides its own
chunk).

Parent: [components](../README.md).

- `CallPanel.vue` orchestrates the call: pre-join → connected stages, the
  room event wiring (tracks, mute, speaking levels, connection quality,
  reconnection), speaker/grid layouts with pinning and screen-share
  spotlight, raise-hand, mid-call device settings, and mic/camera/share/
  leave controls. The panel is a **bounded videocall surface**: the stage
  owns every pixel of height, the root never page-scrolls (only the grid
  and the film strip scroll inside their own boxes), and all controls live
  in one docked bar below the stage — a wrapped header can never eat the
  video area. A connection that drops while the panel stays mounted
  returns to the pre-join stage.
- `CallPrejoin.vue` owns device enumeration (device lists pick through
  the shared `InstanceSelect` wrapper in its plain, non-entity mode),
  live camera preview, a bare microphone-activity dot, and
  mic/cam pre-toggles carried into the join. It shows no room ids — the
  caller is identified by the surface that opened the call.
- `CallTile.vue` renders one participant or screen-share track: video or
  Avatar fallback, speaking level dot, mute/hand badges, and pin. The
  identity chip is the single name owner; the no-video fallback is the
  avatar alone. The connection-quality glyph appears only for degraded
  links (`fair`/`poor`/`lost`) — a healthy connection is the silent
  default. The chip truncates, so long display names cannot overflow a
  tile.
- `CallWorkspacePage.vue` is the pane-hosted call surface used by the home
  workspace: the `CallPanel` stage plus the call's own conversation thread
  (`ChatSupport` embedded and pinned through its `conversation-key` prop,
  meet-style stage + chat), with a pop-out control that hands the live call
  to the shell's floating window and closes the tab. The stage mounts
  full-bleed (no wrapper padding) so the panel's dock hairline spans the
  pane and the video keeps maximum area; the pop-out floats over the stage
  top-right like the tile pin control. It is responsive to
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
  returns the call to a home workspace tab. The mobile counterpart — the
  parked-call entry in the top lane with its reopen dialog — lives beside
  the now-playing dock in [components/media](../media/README.md).

## Panel chrome

The control dock is one structural bar: a `border-chrome-border` hairline
on top, no painted background, icon-only PrimeVue buttons (rounded, text,
secondary; leave is the single danger button). This follows the flat
surface ladder owned by
[assets/tokens](../../assets/tokens/README.md): call surfaces are
structural chrome and paint nothing; `bg-content` stays on chips over
media (tile identity chips, the reconnecting pill). The dock's inner row
is `w-max` with auto margins inside an `overflow-x-auto` bar, so it
centers when it fits and scrolls — never wraps — when the pane is narrow.
Reactions open from a dock button through a PrimeVue `Popover`; floating
reaction badges ride the `riseAndFade` motion pattern over the stage.
Status is shown only where it changes behavior: a reconnecting pill while
the room re-connects, degraded-quality glyphs on tiles.

## Call line state machine

The user's call is one explicit machine in `stores/calls.js`, so every
surface agrees on ringing:

```
idle ──invite──▶ ringing ──accept──▶ joining ──CallPanel connected──▶ in-call
  ▲                 │                                   │               │
  └─ decline/TTL ───┘◄───────────────────────────────────┴─── leave ─────┘
```

`acceptInvite` is a single global transition — accepting or declining in
any surface clears the ring for that room everywhere. `CallPanel` reports
`joinRoom`/`leaveRoom`, and joining also stops any remaining ring for the
room.

The machine tracks the local user's participation and tolerates
concurrent rooms: `in-call` holds while any joined room is live and falls
back to ringing/idle when the last one is left. The room lifecycle —
alive while *anyone* is in it — rides the activity snapshot: webhook
`call.activity` events debounce into an `active-rooms` refetch
(server-filtered to rooms with at least one participant) that drives the
sidebar rows and the chat ongoing-call banner. Ringing is room-scoped too:
an invite drops only after its room was observed running and then left
the snapshot (a caller hanging up before the callee answers stops the
ring immediately), while a room the snapshot never saw running — invites
publish before the caller joins — lives out its 30s TTL. A failed
refetch keeps the last snapshot, and a reopened connections stream
refetches it, so missed webhook events self-heal.

Surface transfers keep the WebRTC connection alive: popping a call out of
its workspace tab (or docking a floating call back) marks the room as
transferring; the unmounting `CallPanel` strips its listeners and parks
the live room in the store, and the adopting panel rebinds the same
events, rebuilds tiles from the current participants/publications, and
continues the call without reconnecting. Parking also hands over the
LiveKit-attached remote-audio elements: they keep playing in the calls
store's hidden document-level sink, so a parked room stays audible, and
the adopting panel moves the same elements into its own sink (never
re-attaching — a fresh `track.attach()` would double the audio).
Transferring a call that has not
connected yet aborts the transfer — the adopting surface falls back to
its own pre-join stage — and a panel that unmounts mid-join never reports
the room joined.
Navigation uses the same parking machinery: hosts that set
`parkOnUnmount` (the workspace call tab, the chat call dialog, and the
mobile top-lane dialog) park the live room when they unmount while
connected — route change, pane tab switch, or dialog close. On desktop
the shell floating window adopts it without reconnecting; on mobile the
now-playing lane's call entry hosts it (see
[components/media](../media/README.md)) — expand reopens the full-screen
dialog whose panel adopts the parked room, and the entry's close leaves
the call. The floating window's own close button keeps leave-on-close
semantics.

## Surface routing

`composables/useCallRouting.js` owns where a call opens: the home
workspace tab is the default (navigating home when the caller lives on
another route); organizations without a generated home workspace fall back
to the floating window, and mobile keeps the full-screen dialog. Accepted
invites and docked calls are parked as `pendingTabRoom` and consumed by
the home workspace's watcher. The mobile and chat-hosted full-screen call
dialogs are `fill` `StandardDialog`s: the dialog root is capped to the
viewport (full-bleed on mobile, viewport-minus-margins on desktop) and
the content area is a non-scrolling flex column, so the call stage owns
every pixel and the control dock stays in view; the dialog header names
the conversation (chat host) or the caller (mobile invites).

## Media plumbing

- Remote audio must be attached to an element to play: subscribed audio
  tracks are attached through LiveKit's `track.attach()` into a hidden
  sink container inside the panel and detached on unsubscribe/disconnect.
  Attached elements register with the room, so the speaker device switch
  (`room.switchActiveDevice('audiooutput', …)`) keeps working. Local mic
  audio is never played back locally.
- Video attachment is idempotent and stable: `CallTile` emits its video
  element only when the element actually changes, and `CallPanel` skips
  `srcObject` resets for elements already playing the track. Tiles are
  patched in place, so audio-level ticks leave every surface untouched.
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
  produces collapsed columns. The grid is also the only vertical scroller
  in the panel.
- Screen shares render `object-contain`; cameras `object-cover`.
  `CallPanel` itself carries no chat — app chat owns messaging; the panel
  only emits `closed` so hosts can tear the surface down. The dock's record
  toggle starts/stops the room's egress recording on conversation rooms
  (direct, group; org rooms have no thread to record into — no toggle).
  While a recording runs, the toggle turns danger-red and a red dot marks
  the stage; state syncs through the shared calls store, which reads the
  recordings snapshot and `call.activity` egress events alongside the
  active-rooms refresh. The finished MP4 lands in the conversation as a
  `video` attachment message (see the
  [livekit feature](../../server/features/livekit/README.md#recordings)).

## Call activity surfaces

Room activity is owned by the shared `calls` store
(`stores/calls.js`): it subscribes once per app to `call.invite` on the
user topic and `call.activity` on the user/org topics, keeps the
`/api/livekit/active-rooms` snapshot fresh, and exposes incoming invites
(30s TTL). Consumers:

- the app shell mounts `IncomingCalls` for ring notifications;
- the app shell mounts the now-playing dock (`components/media`), whose
  mobile lane carries the parked-call entry for calls that lost their
  surface (SPEC §Now playing);
- the generated home sidebar lists ongoing rooms as persistent flat rows
  under the Calls entry (label, participant count, row click joins),
  whose popup flyout lists ringable conversations;
- `ChatSupport` shows an ongoing-call banner with a Join button for the
  open conversation, before joining and after leaving the call.

Room↔conversation mapping helpers (`utils/call-rooms.js`) mirror the
server's derived room-name contract so every surface agrees which
conversation a room belongs to.

Room access, tokens, invites, and webhooks are owned by the
[livekit feature](../../server/features/livekit/README.md).
