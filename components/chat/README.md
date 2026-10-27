# COMPONENT: Chat Surfaces
The chat column's component family. `components/ChatSupport.vue` is the
one public host — same props (`embedded`, `fullPage`, `conversationKey`,
`openCallInPane`, `threadOnly`, `instanceName`) and the `open-call` emit
for every host (the popup dialog, `/chats`, entity panels, the home tab,
the call workspace) — composing the files below. Message semantics,
storage, and the API contract are owned by
[server/features/support](../../server/features/support/README.md).
Parent: [components README](../README.md). Target law: [SPEC](./SPEC.md).
## Structure
| File | Owns |
|---|---|
| `ChatInboxRail.vue` | archive toggle, conversation filter field, folder chips, new-chat menu, conversation rows with swipe actions and the row menu, the drag handle resizing the two-pane rail (16–34 rem, persisted per browser) |
| `ChatThreadHeader.vue` | title, presence, participants popover, call banners and actions, model pin trigger, bot panel trigger, search toggle |
| `ChatMessageList.vue` | the scroll container: lazy paging, anchor scroll, day dividers, unread divider, message rows with swipe-to-reply, the live agent run block, the message context menu |
| `ChatMessageBubble.vue` | one message's content: the sender avatar gutter, reply quote, forwarded provenance, body, attachments, instance refs, caption row with the run's seen marks |
| `ChatComposer.vue` | typing indicator, model select, reply bar, instance target strip, staged files and refs, agent question, voice row, text composer |
| `ChatSearchPanel.vue` | in-thread search: text, sender, attachment-kind filters over `GET /api/support/search`; result rows jump to the message |
| `useChatThread.js` | the thread state core: history paging, realtime reconcile, read cursors and seen derivation, send pipeline, staging, strip, dialogs state; returns the reactive bag every child destructures |
| `useVoiceRecorder.js` | MediaRecorder lifecycle for voice messages; the send tail stays in the thread core |
State law: children are presentational over the thread bag; template
refs bind through the bag in whichever SFC hosts the element.
## Quality bar
| Feature | Law |
|---|---|
| Seen | the last own message of a sender run carries a single mark on persist and a filled mark when another participant's cursor covers it; inbox rows show the same glyph |
| Seen by | the message context menu lists every other participant whose cursor covers the message, each row with name and locale time |
| Search | server-scanned by text, sender, and attachment kind; a result jumps in place — an unmatched older hit loads its surrounding page through one timestamp-anchored request |
| Scroll to end | the floating control shows while scrolled away from the live end and counts messages waiting below; new messages scroll only when the reader is at the end |
| Live state | every `conversation:<key>` event reconciles — message, read cursor, typing, bot activity; cursors arrive on history load (`readCursors`) and stay live |
| Rhythm | day dividers split day boundaries; the unread divider marks the first unread after the viewer's pre-open cursor; sender runs group within three minutes |
| Avatars | wide panes close every sender run with the avatar-only gutter mark; group/instance threads anchor others' runs in the same gutter at every pane width; 1:1 threads carry no sender stamp in the two-sided variant. |
| Long messages | a body taller than 18rem clamps (`max-h-72`) behind the show-more control; expansion is in place through the bag's per-message set; the jump-to-message highlight reveals a clamped target. |
| Members | the group members popover sorts online members first and marks them through the `UserChip` presence dot (the connections layer's org-scoped id set) |
| Rail resize | in the two-pane layout the rail's right edge drags between 16 and 34 rem; the width persists per browser and feeds `--chat-rail-width` |
