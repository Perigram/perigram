# TODO
## Chat surfaces: component refactor + QOL (owner direction, 2026-10-25)
- [x] Decompose `components/ChatSupport.vue` (4267 lines) into the
  `components/chat/` family per the SPEC structure table;
  `ChatSupport.vue` becomes the host shell with its props/emits
  unchanged.
- [x] Author `components/chat/README.md` owning the frontend chat-surface
  contracts; link it from `components/README.md` (folder map + top-level
  SFC table) and from `components/shared/README.md` chat sections.
- [x] Seen marks: thread-side per-run read state over `readCursors` from
  history load plus live `read` events.
- [x] Seen by: message context menu section listing covering
  participants with cursor time.
- [x] In-thread search panel (text, sender, attachment kind) over
  `GET /api/support/search`; result rows jump via goToMessage.
- [x] Scroll-to-end floating control with waiting-message count; unread
  divider; day dividers.
- [x] Realtime reconcile: `read` events update cursors live in the open
  thread.
### Agent Notes
Session `agent/chat-qol-20261025-2035` (worktree `.agent-worktrees/chat-qol`).
Executed: `ChatSupport.vue` (4267 lines) decomposed into the
`components/chat/` family — ChatInboxRail, ChatThreadHeader,
ChatMessageList, ChatMessageBubble, ChatComposer, ChatSearchPanel,
useChatThread (the state core), useVoiceRecorder — with the host shell
keeping the dialogs and its props/emits unchanged. QOL delivered: seen
marks and seen-by menu rows over `readCursors` plus live `read` events;
in-thread server-side search (text, sender, attachment kind) with the
timestamp-anchored jump; scroll-to-end control with waiting count;
unread divider; new messages scroll only while the reader sits at the
end. Validation: SSR smoke 5/5, design-system 32/32, framework-packages,
support specs 46+3, `check-arch`, `framework:validate` — all green;
`check-docs` green except the pre-existing `jagua-rs` submodule link,
which resolves only where the submodule is initialized. Playwright e2e
not run: no live stack (dev servers are owner-run).
- WAITING — owner verification: refactor + QOL on a live stack.
