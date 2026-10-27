```yaml
doc_id: COMPONENTS-CHAT-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-25
updated: 2026-10-27
```
# SPEC: Chat Surfaces
The chat column as a component family a coding agent can navigate one
file at a time, carrying the modern chat quality bar. `ChatSupport.vue`
stays the one public host — same props, emits, and hosts (popup dialog,
`/chats`, entity panels, home tab) — composing the family below.
Parents: [components SPEC](../SPEC.md) · [components README](../README.md).
Message semantics: [support SPEC](../../server/features/support/SPEC.md).
## Structure
| File | Owns |
|---|---|
| `ChatInboxRail.vue` | archive toggle, conversation filter field, folder chips, new-chat menu, conversation rows with swipe actions and row menu |
| `ChatThreadHeader.vue` | title, presence, participants, call actions, model pin, bot panel trigger, search trigger |
| `ChatMessageList.vue` | lazy paging, anchor scroll, day dividers, unread divider, jump-to-message highlight, scroll-to-end control |
| `ChatMessageBubble.vue` | sender-run grouping, reply quote, forwarded provenance, attachments, instance refs, agent run, seen marks |
| `ChatComposer.vue` | text input, mentions, attachment staging, instance refs, voice recording, agent question, create prompt |
| `ChatSearchPanel.vue` | in-thread search: text, sender, attachment-kind filters; result rows; jump |
| `useChatThread.js` | history paging, realtime reconcile, read cursors |
| `useVoiceRecorder.js` | MediaRecorder lifecycle |
State law: stateful logic lives in composables; the SFCs render over
props, emits, and store reads. One concern per file; a change touches
the owning file and its README row.
## Quality bar
| Feature | Law |
|---|---|
| Seen | The last own message of a sender run carries the run's read state: a clock mark while the send is in flight, a single mark on persist, a double mark when another participant's cursor covers it. Inbox rows show the same marks. |
| Seen by | The message context menu lists every other participant whose cursor covers the message, each row carrying the participant name and the locale-formatted cursor time. |
| Search | In-thread search scans stored history server-side, filtered by text, sender, and attachment kind; a result jumps to the message in place under the highlight. The inbox filter field keeps scoping the conversation list. |
| Scroll to end | The list shows a floating scroll-to-end control while scrolled away from the live end; the control carries the count of messages waiting below. |
| Live state | An open thread reconciles every `conversation:<key>` event — message, read, typing, bot activity — and a reconnect refetches the page; inbox counters ride the store's inbox pings. |
| Thread rhythm | Day dividers split day boundaries; the unread divider marks the first unread message after a visit; sender runs group within the three-minute window; rows and bubbles keep their swipe actions. |
| Avatars | Panes 64rem and wider close every sender run with the avatar-only left-gutter mark; group and instance threads anchor others' runs in the same gutter at every pane width; 1:1 threads carry no sender stamp in the two-sided variant. |
| Long messages | A very long body clamps behind a show-more control; expanding reveals it in place; a jump to a clamped message reveals it. |
| Rail resize | The two-pane inbox rail drags at its right edge between 16 and 34 rem; the width persists per browser. |
