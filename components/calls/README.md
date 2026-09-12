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
- Screen shares render `object-contain`; cameras `object-cover`.
  In-call chat is intentionally absent — app chat owns messaging and call
  invites arrive on the conversation topic. Recording/egress is not wired;
  it needs server-side LiveKit egress configuration first.

Room access, tokens, invites, and webhooks are owned by the
[livekit feature](../../server/features/livekit/README.md).
