# COMPONENT: Media

Persistent playback surfaces for media and calls that outlive their source
surface (SPEC §11). One dock host, mounted by the app layout, with
two placements from one component: on desktop a floating media card
top-right whose identity row drags it anywhere in the viewport
(viewport-clamped, position persisted per browser through the shared
floating-panel drag kernel); on mobile an integrated full-width
strip flush at the top of the screen (safe-area aware, hairline-separated
entries, no floating card chrome), beneath the bottom-nav stacking.

Parent: [components](../README.md).

## Now-playing channel

`stores/media.js` owns the single-play policy: a media element starting
playback claims the channel and pauses whatever played before it — inline
players in different messages, or the dock itself. `MessageAttachments` (the
only inline media renderer today) claims on every `play` and registers the
playing element with its descriptor; when its surface unmounts while the
element is still playing (route change, thread switch, dialog close), it
calls `adopt({ kind, url, title, time })`.

Media elements cannot survive their Vue-managed template parents — Vue's
unmount removes moved elements too — so the dock re-creates the element
from the descriptor, seeks to the handed-over position on
`loadedmetadata`, and continues playback through an explicit `play()`
(the originating user gesture already unlocked sound; no `autoplay`
attribute races the seek). Native
controls remain the interface; the dock's chrome adds identity (icon,
title, kind) and dismissal. `dismiss()` pauses and clears; `ended` clears
by itself. The desktop card drags through the shared floating-panel drag
kernel ([`useFloatingDrag`](../../composables/README.md)) — the same
pointer-following move, viewport clamping, and per-browser position
persistence the call window uses.

## Parked calls on mobile

`MediaDock` also renders the mobile top-lane entry for the connected call
session while its placement is `dock` (the desktop parking rule writes
placement `floating` instead, which is itself a mounted surface). The pill names
the conversation through the shared call-room label resolver
(`useCallRoomLabel`) the home sidebar rows use; expand reopens the
full-screen call dialog ([`CallDialog`](../calls/README.md)) whose
`CallPanel` renders the same session, and close leaves the
call (`leaveSession`). Remote audio never pauses in between: the app-level
[`CallAudioRenderer`](../calls/README.md) keeps every remote audio track
attached while the session lives, so the connection and its audio stay
live across any surface move (see
[components/calls](../calls/README.md#call-line-session-and-placement-machines)).

## Related

- Parent: [components](../README.md)
- [stores](../../stores/README.md)
- [components/calls](../calls/README.md)
- [layouts](../../layouts/README.md)
- [Support chat](../../server/features/support/README.md)
