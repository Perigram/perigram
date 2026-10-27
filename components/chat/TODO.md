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
- [ ] e2e/chat-file-upload stalls after opening an instance thread on
  the live stack (reproduced 2026-10-25 ~23:40, post-5a838f7ac, post
  app restart): the inbox row clicks, the composer block never mounts,
  `[data-testid="chat-attach-trigger"]` (ChatComposer.vue:337, mounted
  at ChatSupport.vue:70) never renders; zero console errors, all APIs
  200. The common-chat dialog assertions ride behind this step and stay
  unverified. Refactor shipped without playwright; this is the
  live-stack gap.

## Rail resize + search indications (owner direction, 2026-10-26)
- [x] Drag-resizable two-pane rail (16–34 rem, persisted), width via `--chat-rail-width`.
- [x] Search dropdowns carry explicit "All senders" / "Any type" selections.
- [x] Chat listboxes drop PrimeVue `focusOnHover` (sticky row highlight after cursor leaves).
### Agent Notes (2026-10-26)
Session `agent/chat-rail-resize-*` (worktree `.agent-worktrees/chat-rail`). Inline-style exception row extended for the rail width binding.
- WAITING — owner verification.
### Agent Notes (2026-10-26, drag round)
Rail drag: width state, --chat-rail-width binding, clamp, and persistence
are verified live (style var renders; storage logic unit-exercised). The
mount-time native listener does not attach in the e2e probe environment
(component onMounted marker never fired, zero console errors, fresh
modules served, dev app restarted). Owner check on a real browser
session is the next diagnostic step.
### Agent Notes (2026-10-26, avatar gutter)
Owner direction: the small chatbox shows the sender badge above the
message; the left-gutter avatar is the expected arrangement at every
pane width. Delivered: gutter avatar at all widths (ml-12 always for
others' rows), the narrow sender-label badge row retired.
- WAITING — owner verification.
### Agent Notes (2026-10-27, gutter rework)
Owner verdict: a gutter shows even in 1:1 threads in the two-sided
variant. Restored the SPEC §7 arrangement — the gutter mark and its
row indent are wide-pane (≥64rem) only; narrow panes lead others' runs
with the sender chip again.
- WAITING — owner verification.
### Agent Notes (2026-10-27, sender marks verdict)
Owner verdict: the sender chip over the message is legacy — deleted.
The avatar gutter is the only sender mark: wide panes close every
sender run with it, group/instance threads anchor others' runs in it
at every pane width, and 1:1 threads (human and AI) carry no stamp in
the two-sided variant. SPEC §7 amended to this law.
- WAITING — owner verification.

## Sidebar chats unread badge (owner direction, 2026-10-27)
- [x] The home sidebar's chats entry carries the total unread badge in
  both shapes — the wrapped icon rail and the expanded menu.
### Agent Notes (2026-10-27, sidebar unread badge)
Delivered in `components/generated/GeneratedHomeWorkspace.vue` (rail
icon overlay + PanelMenu `headericon` slot badge on the chats icon)
and matched by the layouts README's mobile chats-tab row; the store's
`totalUnread` feeds every surface.
- WAITING — owner verification.

## Long-message clamp (owner direction, 2026-10-27)
- [x] Very long message bodies clamp behind a show-more control;
  expanding reveals the body in place; a jump to a clamped message
  reveals it.
### Agent Notes (2026-10-27, long-message clamp)
Delivered: the bubble body clamps past 18rem (`max-h-72` +
`overflow-hidden`, measured on mount); `support.showMore` expands in
place through the bag's per-message expansion set; the jump-to-message
highlight reveals a clamped body.
- WAITING — owner verification.
