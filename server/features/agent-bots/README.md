# COMPONENT: Agent Bots

Agent bots give organizations chat-native agents and a programmatic
platform surface. A bot is an ordinary organization member (a user with the
`data.bot` marker — see [users](../users/README.md)) carrying its own
hashed token; it acts with its own grants through the same boundaries as
every other client, never with borrowed user identity.

Three pieces share one tool catalog:

- **Tool catalog** (`tools.js`): the curated vocabulary over existing
  service seams — process definition lifecycle
  ([process-definitions](../process-definitions/README.md): list/get/
  create/update/validate/activate/deactivate, with activation gates
  returned as structured results), the type vocabulary
  ([cts-types](../cts-types/README.md)), instance reads through the
  registry-resolved instance services (party types included, CTS SPEC §13),
  and compiled action listing/execution. Tools run with the calling
  principal's auth; the catalog owns no business logic.
- **MCP transport** (`mcp.js` → `POST /api/mcp`): single-message JSON-RPC
  over streamable HTTP with `application/json` replies and stateless
  sessions (`initialize` → `tools/list` → `tools/call`/`ping`;
  notifications answer 202). Authentication is whatever the auth
  middleware resolved — user JWT, session cookie, or bot token.
- **Chat runtime** (`runtime.js`): registered by the `agent-bots` nitro
  plugin as a support message observer, it decides which bots answer a
  persisted message and drives a bounded tool-calling loop (max 8 rounds)
  over the [LLM capability module](../llm/README.md). Replies re-enter the
  auth-checked support send path as the bot user.

## Conversation membership

| Kind | Membership | Trigger |
|---|---|---|
| Direct with a bot | None needed — pick the bot in the chat user picker | Implicit: the single bot participant answers |
| Group chat | Subscription + group participants entry (posting admission is participant-scoped) | Subscription on `group:<id>` |
| Instance/org chat | Subscription only (instance conversations have no participant list) | Subscription on the instance key or any ancestor key on the message's stored `instancePath` |

Support-channel messages never trigger; bot senders never trigger (no
bot-to-bot loops); one in-flight reply per bot and conversation.

## Bot administration

`GET/POST /api/agent-bots` (list with optional `?conversationKey=`, create
`{ name, roleIds? }` — creation returns the token exactly once),
`DELETE /api/agent-bots/:id`, `POST /api/agent-bots/:id/token` (rotation),
`POST/DELETE /api/agent-bots/subscriptions` (`{ botId, conversationKey }`).
All gated by user-management access in the active organization; bot
membership carries only the narrow `organizations` recovery grant that
opens process definition management, and process roles are assigned like
any member's (org users page).

Bot tokens are `pb_…` values in the `Authorization: Bearer` header; the
stored form is a SHA-256 hash (never in DTOs — the same strip-and-restore
persistence contract as password hashes).

## Related

- [LLM](../llm/README.md) — provider resolution and chat completions
- [Support chat](../support/README.md) — message observers, group participants, the send path bots re-enter
- [Users](../users/README.md) — the bot member marker and token
- [API routes](../../api/README.md)
