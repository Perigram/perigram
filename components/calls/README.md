# COMPONENT: Calls

PrimeVue-native conferencing surfaces over the self-hosted LiveKit service
and the connections layer, built from shared primitives, semantic tokens,
and `livekit-client` (lazily imported; the WebRTC stack rides its own
chunk).

Parent: [components](../README.md).

## Architecture: one session, view surfaces

The connected room is **one session in `stores/calls.js`**: the LiveKit
Room instance, a single event binder, and a reactive state block
(participants with their camera/screen tracks, speaking, quality, local
device states, layout, pin, reactions, device lists). Every call surface —
workspace tab, full-screen dialog, floating window, mobile lane — is a
thin view over that state; mounting or unmounting a surface never touches
the connection. Panels register their room in the store's
`mountedRooms` set while mounted; a connected session with no mounted
surface parks into the desktop floating window automatically (SPEC §11) —
on mobile the media dock's call lane entry takes it. A pending tab room
suspends the auto-rule while the home workspace mounts the adopting tab.

- `CallPanel.vue` renders the session: pre-join → connecting → connected
  or failed stages, speaker/grid stages, the floating control pill, and
  the mid-call device settings popover. It is a **bounded videocall
  surface**: the video stage owns every pixel, the root never page-scrolls
  (only the grid and the film strip scroll inside their own boxes, with
  bottom clearance for the control pill), and the controls float as one
  overlay pill at the bottom center. Device failures are per-track:
  a missing or unplugged mic/camera toasts the failed device and the call
  continues with that track off; only a failed connection fails the
  session, and the failed session clears on retry. Toggle state always
  reads the `LocalParticipant` `isMicrophoneEnabled`/`isCameraEnabled`/
  `isScreenShareEnabled` getters — `set*Enabled` resolves with the
  `LocalTrackPublication`, which stays truthy on mute.
- `CallPrejoin.vue` owns device enumeration (device lists pick through
  the shared `InstanceSelect` wrapper in its plain, non-entity mode),
  live camera preview, a bare microphone-activity dot, and
  mic/cam pre-toggles carried into the join. The pickers switch the live
  source (preview and meter restart on selection), the lists re-read after
  the permission grant and on `devicechange` (labels arrive with the
  grant), and the meter's stream stays live for its analyser to see
  levels. It shows no room ids — the caller is identified by the surface
  that opened the call.
- `CallTile.vue` renders one participant camera or screen-share track:
  video or Avatar fallback, speaking level dot, mute/hand badges, and
  pin. The video element attaches its track itself (`track.attach` on
  mount and track swap, `track.detach` on unmount) — the demo's
  VideoTrack semantics, so adaptiveStream visibility and dynacast
  dimensions follow the real tiles. The identity chip is the single name
  owner; the no-video fallback is the avatar alone — a muted camera reads
  as the avatar, both locally and for remote participants. The
  connection-quality glyph appears only for degraded links
  (`fair`/`poor`/`lost`). The local camera self-view mirrors; screen
  shares never mirror.
- `CallAudioRenderer.vue` is the app-level remote-audio host, mounted
  once by the app shell beside the session: every subscribed remote audio
  track plays through LiveKit-attached elements kept off the visible
  layout, so call audio survives every surface move and stays audible
  while the session is parked (SPEC §11). Attached elements register with
  the room, so the speaker device switch keeps working.
- `CallWorkspacePage.vue` is the pane-hosted call surface used by the home
  workspace: the `CallPanel` stage plus the call's own conversation thread
  (`ChatSupport` embedded and pinned through its `conversation-key` prop,
  meet-style stage + chat), with a pop-out control that seats the session
  in the shell's floating window and closes the tab. The stage mounts
  full-bleed (no wrapper padding) so the panel's control pill floats over
  the pane edge-to-edge stage and the video keeps maximum area; the
  pop-out floats over the stage
  top-right like the tile pin control. It is responsive to
  the pane width through a
  container query: wide panes render the chat as a fixed side rail; narrow
  or split panes stack it below the stage at two-fifths of the call
  height, internally scrollable so the stage keeps the remaining share. Direct and group calls show
  their persistent app chat; org-room calls render stage-only. The
  floating drawer/mobile surfaces keep the full-screen call dialog.
- `CallDialog.vue` is the one full-screen call dialog: the bounded `fill`
  `StandardDialog` (viewport-capped root, non-scrolling content column)
  hosting one `CallPanel`, titled by the conversation or caller name.
  Mobile invites, chat-hosted calls, and the parked-call expansion all
  host it. Closing the dialog keeps the session live — the desktop
  floating window or the mobile lane takes it (SPEC §11).
- `IncomingCalls.vue` is the global ring surface: floating invite cards
  (Join/Decline) mounted by the app shell for every authenticated user.
  A card carries the caller's avatar and name plus, for group and
  instance rooms, the conversation's label as context — resolved through
  the shared room-label resolver; a direct ring is the caller alone.
  Only *new* calls float; ongoing rooms are listed in the home sidebar and
  in chats. Joining opens the call as a home workspace tab (mobile keeps
  the full-screen dialog).
- `CallFloatingWindow.vue` is the absolute floating call window: a
  draggable fixed panel above the app that hosts the session's desktop
  parking surface. Dragging rides the shared floating-panel drag kernel
  ([`useFloatingDrag`](../../composables/README.md)): pointer-following
  move clamped to the viewport with the resting position persisted per
  browser; the window's size is resizable and persisted the same way.
  Docking seats the session in a home workspace tab; closing leaves the
  call. The mobile counterpart — the parked-call entry in the top lane —
  lives beside the now-playing dock in [components/media](../media/README.md).

## Panel chrome

The controls are one floating pill overlay at the bottom center of the
stage: a `bg-content` chip over media with `shadow-overlay`, rounded
text icon buttons (default severity — ink on the content surface), the
layout switch as a two-button segmented control (speaker `pi-id-card`,
grid `pi-th-large`; the active layout is the filled button), a
speaker-layout maximize toggle that hides the film strip so the focus
stream fills the stage, a dispatch control (desktop) that seats the
session in the floating window — the floating window's own panel carries
the dock variant of the same control,
reactions and device settings as PrimeVue `Popover`s anchored at their
buttons, and leave as the single danger button, separated by a hairline
divider. The pill wraps to a second row on narrow panes — every control
stays reachable at any width. Tiles carry the speaking state as a
`ring-status-success` ring, and the spotlight control — a push-pin chip
over the media (an inline Material `push_pin` SVG; primeicons ships no
pin glyph) — reveals on tile hover on
pointer devices (touch widths keep it visible; a spotlighted tile keeps it
lit). Toggled-off devices keep their glyph and carry the state as the
danger color: primeicons ships no slash variants for microphone or
video. Floating reaction badges ride the `riseAndFade` motion pattern over
the stage, above the pill. Status is shown only where it changes
behavior: a reconnecting pill while the room re-connects,
degraded-quality glyphs on tile chips.

## Call line state machine

The user's call is one explicit machine in `stores/calls.js`, so every
surface agrees on ringing:

```
idle ──invite──▶ ringing ──accept──▶ joining ──session connected──▶ in-call
  ▲                 │                                   │               │
  └─ decline/TTL ───┘◄───────────────────────────────────┴─── leave ─────┘
```

`acceptInvite` is a single global transition — accepting or declining in
any surface clears the ring for that room everywhere. The session's
connect reports `joinRoom`; leaving and an unexpected disconnect report
`leaveRoom`.

The machine tracks the local user's participation: `in-call` holds while
the session is connected and falls back to ringing/idle when it ends. The
room lifecycle — alive while *anyone* is in it — rides the activity
snapshot: webhook `call.activity` events debounce into an
`active-rooms` refetch (server-filtered to rooms with at least one
participant) that drives the sidebar rows and the chat ongoing-call
banner. Ringing is room-scoped too: an invite drops only after its room
was observed running and then left the snapshot (a caller hanging up
before the callee answers stops the ring immediately), while a room the
snapshot never saw running — invites publish before the caller joins —
lives out its 30s TTL. A failed refetch keeps the last snapshot, and a
reopened connections stream refetches it, so missed webhook events
self-heal.

The session tolerates one connected room at a time: opening a session for
another room tears the previous one down first.

## Surface routing

`composables/useCallRouting.js` owns where a call opens: the home
workspace tab is the default (navigating home when the caller lives on
another route); organizations without a generated home workspace fall back
to the floating window, and mobile keeps the full-screen dialog. Accepted
invites and docked calls are parked as `pendingTabRoom`; the home
workspace's watcher opens the tab, and the mounted `CallPanel` consumes
the pending room — the floating-window auto-rule stays suspended until a
surface truly exists, so docking can never race the tab into existence.
The mobile and
chat-hosted full-screen call dialogs are the one `CallDialog` host: the
dialog root is capped to the viewport (full-bleed on mobile,
viewport-minus-margins on desktop) and the content area is a non-scrolling
flex column, so the call stage owns every pixel and the control dock
stays in view; the dialog header names the conversation (chat host) or
the caller (mobile invites). Room labels resolve through
`composables/useCallRoomLabel.js` — the one resolver over the loaded
conversation summaries and the auth store — so the floating window, the
media dock's parked-call pill, and the sidebar's active-room rows agree
on the name.

## Media plumbing

- Every track attachment rides LiveKit's own element pool
  (`track.attach` / `track.detach`): the library owns `srcObject`,
  autoplay, and the Safari/Firefox attach quirks, and attached elements
  register with the room — adaptiveStream visibility (a backgrounded tab
  pauses video, returning resumes it) and dynacast dimensions follow the
  real elements. Call tiles attach in `CallTile`; remote audio attaches
  in the app-level `CallAudioRenderer`.
- Local mic audio stays silent for its own panel; the renderer plays
  remote audio only.
- A screen tile lives only while its track does (subscribe/unpublish drop
  it); a camera tile lives with its participant and falls back to the
  avatar when its video mutes or unpublishes.
- Raise-hand and reactions ride a `call.events`-topic data channel;
  inbound data on any other topic is ignored.
- Device lists live on the session, refreshed on connect (labels arrive
  with the permission grant), when the settings dialog opens, and on the
  room's `MediaDevicesChanged`.

## Layouts

- Speaker view follows the demo's focus semantics: **pinned tile, else
  the first screen share, else the active speaker, else the first
  tile**, rendered as one large spotlight plus a film strip (side strip
  on wide containers through a container query). Pinning works per tile
  — a camera or a screen share. The maximize toggle hides the strip and
  the focus stream fills the whole stage. Spotlighted screen shares hug their live
  source proportions (the tile reports the video's aspect from the
  element's own resize events and caps itself to the stage box) while
  cameras fill the stage (`object-cover`).
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
  mobile lane carries the parked-call entry for the connected session
  while it has no mounted surface (SPEC §11);
- the generated home sidebar lists ongoing rooms as persistent flat rows
  under the Calls entry (label, participant count, row click joins),
  whose popup flyout lists ringable conversations;
- `ChatSupport` shows an ongoing-call banner with a Join button for the
  open conversation, before joining and after leaving the call.

Room names and room↔conversation mapping come from the one grammar home,
[`shared/call-rooms.js`](../../shared/README.md), so every surface
agrees which conversation a room belongs to.

Room access, tokens, invites, and webhooks are owned by the
[livekit feature](../../server/features/livekit/README.md).
