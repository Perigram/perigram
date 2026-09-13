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
  container query: wide panes render the chat as a fixed side rail, narrow
  or split panes stack it below the stage, capped at 60% of the call
  height and internally scrollable so the stage always keeps its place. Direct and group calls show
  their persistent app chat; org-room calls render stage-only. The
  floating drawer/mobile surfaces keep the full-screen call dialog.
- Screen shares render `object-contain`; cameras `object-cover`.
  `CallPanel` itself carries no chat — app chat owns messaging; the panel
  only emits `closed` so hosts can tear the surface down. Call invites
  arrive on the conversation topic. Recording/egress is not wired;
  it needs server-side LiveKit egress configuration first.

Room access, tokens, invites, and webhooks are owned by the
[livekit feature](../../server/features/livekit/README.md).
