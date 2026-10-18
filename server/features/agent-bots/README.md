# COMPONENT: Agent Bots

The organization AI gives every member a chat-native agent over the same
boundaries as every other client. There are no created bots: one
assistant member per organization is the AI's attribution identity (see
[users](../users/README.md) for the bot marker) — it carries no token and
no operational grants of its own. Every run executes **delegated**: with
the access rights of the user whose message triggered it, replying under
the assistant's identity.

AI chats are role-gated: an organization role may carry the `agentChat`
capability ([organizations](../organizations/README.md)), and only
members holding at least one such role see the AI at all — the contact
endpoint answers `canChat: false` and the pickers render no AI row.
Senders who lose the capability leave the AI silent.

Model selection lives at the execution points, composing as optional
overrides: **wake rule → conversation subscription → org `chat`
route → environment**. The chat carries a per-conversation model select
beside the AI (`POST /api/agent-bots/subscriptions` accepts `profile`
and `model` on the body and on `wakeOn` rules, validated against the org
model table). Stale stored ids degrade to the next level instead of
breaking the run.

Three pieces share one tool catalog:

- **Tool catalog** (`tools.js`): the curated vocabulary over existing
  service seams — process definition lifecycle
  ([process-definitions](../process-definitions/README.md): list/get/
  create/update/validate/activate/deactivate, declaration apply
  (`apply_declarations` — the designer Apply's declaration step: posts
  the draft's in-tree declarations into the registry, required before
  activation because validation overlays the draft while the activation
  compile resolves the registry), status-migration
  declaration (`declare_status_mappings` — the Apply gate's decision,
  authored without a whole-document echo), plus a graph-level save
  (`update_definition_graph` — nodes, wires, and value inputs without
  echoing the whole document), with activation gates returned as
  structured results), the authoring vocabulary
  (`get_authoring_vocabulary` — the compose guide, the organization's role
  list (the grant vocabulary the designer's
  [lanes](../../../components/process-designer/README.md) author through
  effect `access.grants`, one grant per effect), node families, and the
  palette's droppable item
  ids, COMPACT by default; the per-kind socket inventory (`detail:
  'sockets'` — every kind's input/output socket ids, what `connect`
  addresses), the node catalog, and typed value-operation
  sockets arrive on request through `detail` filters — one oversized
  vocabulary response must never evict the tools from a small model's
  context window), headless composition and editing
  (`compose_process_definition` / `edit_process_definition` — ordered
  designer gestures through the same authoring seam the designer shell
  drives, with the same legality gates; editing seeds the seam onto the
  stored draft, so "add a node, wire it" is two small gestures with no
  graph echo-back), the type
  vocabulary
  ([cts-types](../cts-types/README.md)), instance reads through the
  registry-resolved instance services (party types included, CTS SPEC §13),
  and compiled action listing/execution. The action manifest is LIVE per
  call — the manifest tools re-resolve the delegated principal's current
  assignments, so process vocabulary activated mid-run is runnable in the
  same run, exactly as a human's next request would see it.
  `get_process_definition` serves a
  compact digest by default (node ids/kinds/typeIds, edges with socket
  ids, value-input keys); the full authored document only on `full: true`.
  The definition tools move
  authored data only: the activation-written records (`compiled`,
  `history`, `activated`) are stripped on load and preserved on save —
  the stored record runs to megabytes, which no model can echo back
  through the full-replace save. Every tool result above 16 KB returns
  truncated with a notice pointing at the narrower reads — the loop's
  context is a shared resource, and no single call may blind the model. `attach_instances` is chat-run
  only: it validates instances through the support message-write ref seam
  ([support](../support/README.md) inline instance references) and rides
  them on the AI's reply as reference chips — validation runs under the
  delegating user's rights at both the tool call and persistence
  (`refsAuth`), so the role-less assistant never drops a delegated
  attachment; the MCP listing excludes
  chat-only tools. `web_search` rides the
  [web-search](../web-search/README.md) capability seam and is org-gated:
  organizations without a configured search provider offer it nowhere —
  the descriptor builders (chat and MCP alike) omit it, the same
  capability-availability law an unconfigured LLM follows. `read_attachment`
  (chat-run only) reads a file attached to a message in the run's own
  conversation — the run's history marks every attachment as
  `[attachment: name <fileId:id>]`, and the reader
  (`attachment-read.js`) extracts by family: text decodes as UTF-8,
  spreadsheets (csv/xlsx/xls) flatten to per-sheet CSV, PDFs extract
  page text (the pdfjs seam the artifact templates already use), DOCX
  unwraps its document body (jszip), and audio transcribes through the
  organization's
  [transcription](../transcription/README.md) seam; images and video
  are refused with the text-only boundary, and unrecognized binaries
  are refused outright. The room scoping rides the support seam's
  conversation-attachment lookup, so the model can never reach a file
  the room it answers does not already carry. `ask_user` (chat-run
  only) suspends the run on the room's answer — the room-input channel
  for decisions that belong to it (activation gates carrying live data,
  genuinely ambiguous intent); its routing and lifecycle ride the
  runtime's pending-question registry (see the chat runtime above).
  Tools run with
  the principal's auth they are given; the catalog owns no business logic.
- **MCP transport** (`mcp.js` → `POST /api/mcp`): single-message JSON-RPC
  over streamable HTTP with `application/json` replies and stateless
  sessions (`initialize` → `tools/list` → `tools/call`/`ping`;
  notifications answer 202). Authentication is whatever the auth
  middleware resolved — a user JWT or session cookie; tools run with
  that principal's grants. There are no bot tokens.
- **Chat runtime** (`runtime.js`): registered by the `agent-bots` nitro
  plugin as a support message observer, it decides when the AI answers a
  persisted message — multi-human rooms (group rooms with more than two
  participants, and every instance room) only when the message names the
  assistant (`@` + its name, case-insensitive, word-bounded;
  two-participant assistant rooms are the AI's own person-style threads
  and answer every message; the chat composer completes the address —
  typing `@` opens the room's candidate list, the seated AI first, then
  the room's human participants, and user tags are composer text) — and
  drives the tool-calling loop until the
  model answers — the room's stop control and the provider idle guard
  are the only terminators — over
  the [LLM capability module](../llm/README.md) on the `chat`
  capability route. The run executes with the **triggering sender's**
  request-shaped auth (`buildPrincipalAuth` — the same construction the
  auth middleware produces), so every tool call enforces exactly what
  that user may do; a sender without the agent-chat capability, or one
  from another organization than the subscription's, is skipped silently
  — the subscription's organization is the wake boundary. Replies
  re-enter the auth-checked support send path
  as the assistant user, carrying the run's provenance
  (`agent: { steps }` — the run's chronology: per-round reasoning
  segments interleaved with tool invocations, in the order they happened;
  a tool step carries `detail`, the compact human summary of what the
  call addressed — authored vocabulary only, a definition name,
  instance type, or action id, never a storage id)
  onto the persisted message — the
  activity block the chat renders attached to the answer. A run that
  dies without an answer still answers the room: the failure notice
  persists with a `notice` severity (`error` for run failures, `warn`
  for the unconfigured-provider state — see
  [support](../support/README.md)), so clients render it as a
  severity-styled system notice; a dead provider's notice keeps the
  run's chronology attached. While the
  run is in flight it publishes the same activity onto every
  conversation topic the trigger message fans out to (its own thread
  plus its instance path, mirroring the support message fanout — the
  organization chat view sees the run beside the trigger like any other
  message) — `bot_activity` with the chronology so far (one reasoning
  segment per round, tool invocations as they start and settle carrying
  the failure message when one was rejected, always
  a snapshot), `bot_stream` with the answer so far, and
  `bot_stream_end` when the
  persisted message supersedes the live view. `ask_user` suspends the
  run on the room's answer: `bot_question` (with one-tap options)
  renders at the composer until `bot_question_end` — answered by the
  next capability-holding participant message in the asking
  conversation (consumed by the observer as the answer, never a second
  trigger), ended by stop, or timed out (10 minutes) with a readable
  no-answer error the run concludes from. The activity itself is the
  run's pre-step presence signal: the assistant rides the room's typing
  line until the first step or answer streams, then the activity is the
  presence; a
  tool round retracts only its answer text, and each round reconciles
  the sink with the assembled neutral message (a reasoning-first stream
  that ends tagless was a plain answer). A run in flight is stoppable
  (`POST /api/agent-bots/stop` with the conversation key): the room's
  composer control aborts the request, the loop keeps the answer
  produced so far and persists it, and a stopped wake stays silent like
  a failing one. A stop landing mid-tool-batch drops the remaining
  calls (each answers the model with a readable stopped result instead
  of executing), `web_search` carries the run's stop signal onto its
  provider request, and the client freezes bot events between the click
  and the run's true end so the aborting run's last reconcile events
  cannot resurrect the stream card. In-flight runs are keyed by the SUBSCRIBED room and
  hold their cancellation handle plus every key the stop may arrive
  from (the room's or any view the trigger fans out to), so the stop
  reaches exactly the room's run — and one run occupies a room at a
  time: a trigger arriving mid-run (chat reply or wake alike) is
  coalesced, never dropped — the latest re-fires when the current run
  lands, with a fresh history snapshot covering everything said
  meanwhile; a stopped room's coalesced trigger dies with the stop.
  Identical-call repetition is the one in-loop brake: the same tool
  with the same arguments landing a third time is blocked before
  execution and answered with a structured instruction to change
  inputs, change approach, or ask the room; a changed argument list
  always proceeds.

## Conversation membership

| Kind | Membership | Trigger |
|---|---|---|
| AI chat (fresh thread) | Created by `POST /api/agent-bots/chats` — a persisted room with exactly the caller and the assistant, subscribed like any group room | Every message (its own person-style thread): subscription on `group:<id>` |
| Direct with the AI | None needed — legacy threads from the created-bots era; the assistant participant answers implicitly | Implicit: the assistant participant answers |
| Group chat | Subscription + group participants entry (posting admission is participant-scoped) | Subscription on `group:<id>`, mention-gated above two participants |
| Instance/org chat | Subscription only (instance conversations have no participant list) | Subscription on the instance key or any ancestor key on the message's stored `instancePath` (own thread before the nearest ancestor — the first subscribed key pins the run's model), mention-gated |

Every new chat with the AI is a **fresh thread** (SPEC: agent access): the
new-chat picker's AI row opens an empty draft — nothing is persisted until
the first message is sent, which creates the room titled by that message
(the assistant's own name when the opener is attachment-only). The
group shape is what makes any number of threads per member possible; AI
chats are ordinary group rooms, so their history, read marks, model pins,
wake rules, and deletion all ride the group contract — deleting the room
drops its subscription rows (the delete route composes `onGroupDeleted`).
Presentation is person-chat, not group-chat: the client detects the
two-participant assistant rooms and renders them without group chrome —
no member count, no members list, no sender stamps, no AI-panel control
(the composer's model select pins the room; the panel is a group/instance
-room affordance). The thread header is the title and the shared AI
face (the microchip avatar — no text badge). The
rail's one + menu owns every conversation start — person chat, group,
AI chat (offered to members holding the agent-chat capability).

The conversation is a model execution point in every kind: group and
instance rows carry the pin (`profile`, `model`) on the subscription, a
direct chat with the AI through a profile-only subscription row (no
membership, no wake rules — those rows never match the wake scanner's
`wakeOn` query). The chat's model select lists what the org's chat
endpoints actually serve (`chatModels` off the LLM seam) and pins both
profile and model on the row; the run overrides the request's model
with it (blank falls back to the org `chat` route — the contact response
carries its resolved `chatRouteModel` so the select never sits blank).
Wakes from that conversation inherit its row.

Bringing the AI into a room is participant-level (any member holding
the agent-chat capability, through the thread header's AI panel); human
membership keeps the creator-or-admin gate, and the human membership
seams refuse bot targets outright — assistant membership is twin-only,
so the participants entry and the subscription cannot diverge through
member management. Support-channel messages never trigger; the AI never
triggers itself (no loops); a message answering the room's suspended
question steers the waiting run instead of triggering a new one; one run
per subscribed room at a time (chat
replies and wakes share the lock space), and the subscription's
organization is the wake boundary — an assistant answers only its own
org's members.

## The org assistant

Every organization has exactly one AI identity (SPEC: agent access),
lazily bootstrapped through its deterministic address
`assistant-<orgId>@bots.perigram.internal` — collision means it exists,
so bootstrap is idempotent across workers. `GET /api/agent-bots/contacts`
(member-visible, capability-gated, optional `?conversationKey=`) ensures
the assistant and returns its single row decorated with the
conversation's subscription flag and wake rules; the response also
carries the org's chat profile/model tables and the resolved
`chatRouteModel`. The chat picker floats the AI row above human members
(the badge rides the user DTO's bot marker), so chatting with the agent
is a new chat away — nobody creates anything first, and there is no bot
administration anywhere: the assistant takes no process roles (delegation
follows the chatting user), holds no token, and cannot be deleted from
the team surface.

## Lifecycle wakes

Subscription rows carry wake rules — `wakeOn: [{ type, state, profile?,
createdBy }]` — and the wake scanner turns matching status transitions
into proactive AI runs:

- **Scanner** (`wake-scanner.js`, wired by the `agent-wake-scanner` nitro
  plugin; `AGENT_WAKE_SCAN_INTERVAL_MS`, default 30s, disabled at `0`):
  a scheduled sweep over new `status_events`
  ([states](../states/README.md) `findStatusEventsAfter`) past a
  `system_settings` cursor, advanced to the batch end before firing — a
  crash mid-batch drops the un-fired tail rather than replaying it (wakes
  are best-effort automation, not delivery guarantees).
- **Matching**: `transition`/`intent` operations wake (creation
  initialize events do not); events whose acting principal is a bot never
  wake (no self-perpetuating loops — SYSTEM actors such as deadline
  moves do); a same-type instance-chat subscription narrows to its own
  instance, every other subscription (the organization chat included) is
  org-wide for the rule's type.
- **Wake run** (`runAssistantWake`): the run executes delegated to the
  matched rule's author (`createdBy`) — the target instance is resolved
  through that user's access-checked registry read, and a missing author
  or one who lost the agent-chat capability skips the wake silently,
  which is the org-isolation boundary — the transition becomes a trigger
  message beside the room's recent history, and the loop's answer lands
  in the subscribed conversation attributed to the assistant. No
  provider or a failing wake logs and stays silent: nobody is waiting in
  the room.
- **Authoring**: wake rules are assignment-side data on the subscription
  (the chat AI panel's wake editor: type + state), never process
  vocabulary — the state machine stays authored in the designer, and
  in-graph agent nodes remain out of contract. `GET
  /api/agent-bots/wake-options` lists the org's active compiled
  primary-region states for the pickers (compiled-snapshot reads, the
  deadline-scanner law: scans and pickers only, auth always recompiles).

## API

- `POST /api/agent-bots/chats` (`{ name?, profile?, model? }`) — a fresh
  AI chat thread: a subscribed room with the caller and the assistant,
  named by the caller (the first message's clipped text) or the
  assistant's own name; the room's model pin may ride the creation (a
  draft thread picks its model before the first message materializes
  the room).
- `POST/DELETE /api/agent-bots/subscriptions` (`{ conversationKey,
  wakeOn?, profile?, model? }` — bring the AI into a room or remove it;
  `wakeOn` is the subscription's lifecycle wake rule list: omitted
  leaves stored rules, `null`/`[]` clears, a non-empty array replaces
  with each rule authored by the caller), `GET
  /api/agent-bots/contacts` (the capability-gated AI row and model
  tables), `GET /api/agent-bots/wake-options` (active compiled primary
  states for the wake-rule pickers), and `POST /api/agent-bots/stop`
  (`{ conversationKey }` — stop the room's in-flight run). Bot
  administration routes (create, delete, token rotation, per-bot brain)
  are retired with the created-bots scheme; migration
  `server/scripts/migrate-retire-custom-bots.js` removes stored custom
  bots and group-deletion orphaned subscription rows once at deploy.

## Related

- [LLM](../llm/README.md) — provider resolution and chat completions
- [Support chat](../support/README.md) — message observers, group participants, the send path the AI re-enters
- [Users](../users/README.md) — the assistant's bot marker
- [Organizations](../organizations/README.md) — the `agentChat` role capability
- [API routes](../../api/README.md)
