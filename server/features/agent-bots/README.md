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
  create/update/validate/activate/deactivate, plus a graph-level save
  (`update_definition_graph` — nodes, wires, and value inputs without
  echoing the whole document), with activation gates returned as
  structured results), the authoring vocabulary
  (`get_authoring_vocabulary` — the compose guide, the designer's palette
  groups, node catalog, and typed value-operation sockets served straight
  off the [processes package](../../../packages/processes/README.md)) and
  headless composition (`compose_process_definition` — ordered designer
  gestures through the same authoring seam the designer shell drives,
  with the same legality gates), the type
  vocabulary
  ([cts-types](../cts-types/README.md)), instance reads through the
  registry-resolved instance services (party types included, CTS SPEC §13),
  and compiled action listing/execution. The definition tools move
  authored data only: the activation-written records (`compiled`,
  `history`, `activated`) are stripped on load and preserved on save —
  the stored record runs to megabytes, which no model can echo back
  through the full-replace save. `attach_instances` is chat-run
  only: it validates instances through the support message-write ref seam
  ([support](../support/README.md) inline instance references) and rides
  them on the AI's reply as reference chips; the MCP listing excludes
  chat-only tools. Tools run with the principal's auth they are given;
  the catalog owns no business logic.
- **MCP transport** (`mcp.js` → `POST /api/mcp`): single-message JSON-RPC
  over streamable HTTP with `application/json` replies and stateless
  sessions (`initialize` → `tools/list` → `tools/call`/`ping`;
  notifications answer 202). Authentication is whatever the auth
  middleware resolved — a user JWT or session cookie; tools run with
  that principal's grants. There are no bot tokens.
- **Chat runtime** (`runtime.js`): registered by the `agent-bots` nitro
  plugin as a support message observer, it decides when the AI answers a
  persisted message and drives a bounded tool-calling loop (max 8 rounds)
  over the [LLM capability module](../llm/README.md) on the `chat`
  capability route. The run executes with the **triggering sender's**
  request-shaped auth (`buildPrincipalAuth` — the same construction the
  auth middleware produces), so every tool call enforces exactly what
  that user may do; a sender without the agent-chat capability is
  skipped silently. Replies re-enter the auth-checked support send path
  as the assistant user, carrying the run's provenance
  (`agent: { steps }` — the run's chronology: per-round reasoning
  segments interleaved with tool invocations, in the order they happened)
  onto the persisted message — the
  activity block the chat renders attached to the answer. While the
  run is in flight it publishes the same activity onto the conversation
  topic — `bot_activity` with the chronology so far (one reasoning
  segment per round, tool invocations as they start and settle carrying
  the failure message when one was rejected, always
  a snapshot), `bot_stream` with the answer so far, and
  `bot_stream_end` when the
  persisted message supersedes the live view. The activity itself is the
  run's presence signal (the AI never rides the human typing line); a
  tool round retracts only its answer text, and each round reconciles
  the sink with the assembled neutral message (a reasoning-first stream
  that ends tagless was a plain answer). A run in flight is stoppable
  (`POST /api/agent-bots/stop` with the conversation key): the room's
  composer control aborts the request, the loop keeps the answer
  produced so far and persists it, and a stopped wake stays silent like
  a failing one. In-flight runs are keyed by conversation and hold their
  cancellation handle, so the stop reaches exactly the room's run.

## Conversation membership

| Kind | Membership | Trigger |
|---|---|---|
| AI chat (fresh thread) | Created by `POST /api/agent-bots/chats` — a persisted room with exactly the caller and the assistant, subscribed like any group room | Subscription on `group:<id>` |
| Direct with the AI | None needed — legacy threads from the created-bots era; the assistant participant answers implicitly | Implicit: the assistant participant answers |
| Group chat | Subscription + group participants entry (posting admission is participant-scoped) | Subscription on `group:<id>` |
| Instance/org chat | Subscription only (instance conversations have no participant list) | Subscription on the instance key or any ancestor key on the message's stored `instancePath` |

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
-room affordance). The thread header is the title and the AI badge. The
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
membership keeps the creator-or-admin gate. Support-channel messages
never trigger; the AI never triggers itself (no loops); one in-flight
run per conversation (chat replies and wakes share the lock space).

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

- `POST /api/agent-bots/chats` (`{ name? }`) — a fresh AI chat thread: a
  subscribed room with the caller and the assistant, named by the caller
  (the first message's clipped text) or the assistant's own name.
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
