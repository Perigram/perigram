# COMPONENT: Agent Bots

Agent bots give organizations chat-native agents and a programmatic
platform surface. A bot is an ordinary organization member (a user with the
`data.bot` marker — see [users](../users/README.md)) carrying its own
hashed token; it acts with its own grants through the same boundaries as
every other client, never with borrowed user identity.

Model selection lives at the execution points, composing as optional
overrides: **wake rule → conversation subscription → bot → org `chat`
route → environment**. The bot sheet carries a per-conversation model
select beside each subscribed bot and an optional model on each wake
rule (`POST /api/agent-bots/subscriptions` accepts `profile` on the body
and on `wakeOn` rules, validated against the org model table); the org
bots page sets each bot's own default (`PATCH
/api/agent-bots/:id/profile`). Stale stored ids degrade to the next
level instead of breaking the run.

Three pieces share one tool catalog:

- **Tool catalog** (`tools.js`): the curated vocabulary over existing
  service seams — process definition lifecycle
  ([process-definitions](../process-definitions/README.md): list/get/
  create/update/validate/activate/deactivate, with activation gates
  returned as structured results), the type vocabulary
  ([cts-types](../cts-types/README.md)), instance reads through the
  registry-resolved instance services (party types included, CTS SPEC §13),
  and compiled action listing/execution. `attach_instances` is chat-run
  only: it validates instances through the support message-write ref seam
  ([support](../support/README.md) inline instance references) and rides
  them on the bot's reply as reference chips; the MCP listing excludes
  chat-only tools. Tools run with the calling principal's auth; the
  catalog owns no business logic.
- **MCP transport** (`mcp.js` → `POST /api/mcp`): single-message JSON-RPC
  over streamable HTTP with `application/json` replies and stateless
  sessions (`initialize` → `tools/list` → `tools/call`/`ping`;
  notifications answer 202). Authentication is whatever the auth
  middleware resolved — user JWT, session cookie, or bot token.
- **Chat runtime** (`runtime.js`): registered by the `agent-bots` nitro
  plugin as a support message observer, it decides which bots answer a
  persisted message and drives a bounded tool-calling loop (max 8 rounds)
  over the [LLM capability module](../llm/README.md) on the `chat`
  capability route. Replies re-enter the
  auth-checked support send path as the bot user.

## Conversation membership

| Kind | Membership | Trigger |
|---|---|---|
| Direct with a bot | None needed — pick the bot (the assistant floats first) in the new-chat picker | Implicit: the single bot participant answers |
| Group chat | Subscription + group participants entry (posting admission is participant-scoped) | Subscription on `group:<id>` |
| Instance/org chat | Subscription only (instance conversations have no participant list) | Subscription on the instance key or any ancestor key on the message's stored `instancePath` |

Joining a bot to a room is participant-level (any member, through the
thread header's bot sheet); human membership keeps the creator-or-admin
gate. Support-channel messages never trigger; bot senders never trigger
(no bot-to-bot loops); one in-flight reply per bot and conversation (chat
replies and wakes share the lock space).

## Org assistant and contacts

Every organization has one assistant bot (SPEC: agent access), lazily
bootstrapped through its deterministic address
`assistant-<orgId>@bots.perigram.internal` — collision means it exists,
so bootstrap is idempotent across workers. `GET /api/agent-bots/contacts`
(member-visible, optional `?conversationKey=`) ensures the assistant and
returns every org bot decorated with the conversation's subscription flag
and wake rules; the assistant sorts first. The chat pickers float these
rows above human members (the badge rides the user DTO's bot marker), so
chatting with an agent is a new chat away — nobody creates anything
first. Bot administration (create, token, delete) stays manager-gated in
the same sheet.

## Lifecycle wakes

Subscription rows carry wake rules — `wakeOn: [{ type, state }]` — and the
wake scanner turns matching status transitions into proactive agent runs:

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
- **Wake run** (`runBotWake`): the target instance is resolved through
  the bot's own access-checked registry read — an unreadable target skips
  the wake, which is the org-isolation boundary — the transition becomes
  a trigger message beside the room's recent history, and the loop's
  answer lands in the subscribed conversation. No provider or a failing
  wake logs and stays silent: nobody is waiting in the room.
- **Authoring**: wake rules are assignment-side data on the subscription
  (the chat bot panel's wake editor: bot + type + state), never process
  vocabulary — the state machine stays authored in the designer, and
  in-graph agent nodes remain out of contract. `GET
  /api/agent-bots/wake-options` lists the org's active compiled
  primary-region states for the pickers (compiled-snapshot reads, the
  deadline-scanner law: scans and pickers only, auth always recompiles).

## Bot administration

- `GET/POST /api/agent-bots` (list with optional `?conversationKey=`, create
  `{ name, roleIds? }` — creation returns the token exactly once),
  `DELETE /api/agent-bots/:id`, `POST /api/agent-bots/:id/token` (rotation),
  `PATCH /api/agent-bots/:id/profile` (`{ profile }` — the bot's model
  override: a chat profile id from the org model table, empty for the
  org's chat route; unknown or non-chat ids are refused, stale stored
  references degrade to the route chain),
  `POST/DELETE /api/agent-bots/subscriptions` (`{ botId, conversationKey,
  wakeOn? }` — `wakeOn` is the subscription's lifecycle wake rule list:
  omitted leaves stored rules, `null`/`[]` clears, a non-empty array
  replaces), and `GET /api/agent-bots/wake-options` (active compiled
  primary states for the wake-rule pickers). `GET /api/agent-bots/contacts`
  is the member-visible twin of the listing (ensures the org assistant,
  no admin gate).
Bot joins are participant-level; bot administration (create, token
rotation, delete) is an organization-settings concern — the
`/organization/bots` system screen (`users:admin` gated), with the
one-time token reveal and copy there. The chat sheet stays join/wake
only. Bot membership carries only the narrow `organizations` recovery
grant that opens process definition management, and process roles
("lanes") are assigned like any member's — on the org team surface,
where bot rows carry the badge and single-seat roles say so in the
picker.

Bot tokens are `pb_…` values in the `Authorization: Bearer` header; the
stored form is a SHA-256 hash (never in DTOs — the same strip-and-restore
persistence contract as password hashes).

## Related

- [LLM](../llm/README.md) — provider resolution and chat completions
- [Support chat](../support/README.md) — message observers, group participants, the send path bots re-enter
- [Users](../users/README.md) — the bot member marker and token
- [API routes](../../api/README.md)
