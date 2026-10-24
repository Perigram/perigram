# COMPONENT: LLM

LLM is a capability module: it turns chat-completion requests into
assistant messages through a selectable provider table (owner direction
2026-10-15: local models on self-hosted servers, with options to choose
from). It owns no collection — agent state and tool execution live with
the consuming feature ([agent bots](../agent-bots/README.md) is the first
consumer).

## Providers

Each provider speaks its own real wire protocol; the module translates a
single neutral conversation contract (system string, user/assistant/tool
messages, structured tool calls with object arguments) onto the wire:

| Provider | Endpoint | Wire shape |
|---|---|---|
| `ollama` | `{baseUrl}/api/chat` | Native Ollama: function tools, object `arguments`, `message` response. |
| `anthropic` | `{baseUrl}/v1/messages` | Messages protocol: `system` field, content blocks, `tool_use`/`tool_result`; `anthropic-version` header always, `x-api-key` when a key resolves. |
| `openai` | `{baseUrl}/chat/completions` | The chat-completions shape for local OpenAI-shaped servers (vLLM, LocalAI); tool arguments stringified on the wire. |

Every provider streams on request — `stream: true` in its own dialect
(Ollama newline-delimited JSON, the OpenAI-shaped `data:` SSE,
Messages-protocol SSE events) — and the module reassembles the fragments
(text deltas, split tool arguments) back onto the same neutral contract.

Model listings and probes treat a 200 that carries an error envelope as
an error: gateways that answer `{success: false, msg}` (Z.AI does)
surface their own message, never masked as an empty listing. The models
screen offers known providers as login options on top of the three wire
dialects — the Z.AI GLM coding plan stores its wire truth as provider
`anthropic` against `https://api.z.ai/api/anthropic` (its
Claude-Code-compatible route), with the UI owning the preset identity;
model choice never lives in the preset — pickers are endpoint-fed.

Outbound requests (completions and listings) share one egress seam
(exported as `egressFetch` and reused by
[web-search](../web-search/README.md) for its provider calls):
Node's built-in fetch ignores proxy env, so when `HTTP(S)_PROXY` is set
the seam rides undici's `EnvHttpProxyAgent` (`NO_PROXY` honored, CIDR
included — LAN endpoints stay direct); without proxy env it is the
global fetch. The dispatchers' stall deadlines are zeroed (owner
direction 2026-10-18): a dead peer surfaces as a network error, and
caller AbortSignals are the only cancellation. The compose files pass `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`
through to the app container, defaulting `NO_PROXY` to loopback plus the
private ranges — set the proxy vars in `.env` to the address reachable
FROM the container (the host's loopback proxy is not `127.0.0.1` there).

A base URL is always explicit configuration; a provider resolves only
from a configured endpoint. `provider: 'none'` (the default) disables
the LLM everywhere.

## Configuration Resolution

Organizations declare **named model profiles** (owner direction
2026-10-15: models live on different endpoints per purpose) at
`data.settings.llm.profiles` and **route capabilities** to them at
`data.settings.llm.routes`. A profile is a login — kind, wire provider,
base URL, key — and nothing else: its `model` field is derived data,
backfilled on save from the endpoint's own listing (the first model it
serves) and kept while the endpoint stands. Model choice never happens
in profile setup; it lives at the execution points.

```json
{
  "profiles": {
    "local-fast": { "kind": "chat", "provider": "ollama", "baseUrl": "http://a:11434", "model": "qwen3:8b" },
    "cloud-big":  { "kind": "chat", "provider": "anthropic", "baseUrl": "…", "model": "glm-4.7", "apiKey": "…" },
    "images":     { "kind": "image", "provider": "openai", "baseUrl": "http://img:8080", "model": "sd-xl" }
  },
  "routes": { "chat": "local-fast", "chat.summaries": "cloud-big" }
}
```

`resolveLlmConfig(organizationId, capability, { profileId })` walks the
chain — an explicit profile (a pinned execution-point choice) first, then
the exact capability route, the `chat` family default, the environment —
and only a chat-kind profile ever serves a conversation (stale or non-chat
explicit ids degrade to the route chain). An unrouted org with **exactly
one** chat profile serves it for every chat capability — a configured
model is the chat model unless routing says otherwise; two or more
unrouted profiles stay ambiguous and degrade to the environment.
Image-kind profiles (endpoint, model, key) are declarable;
[transcription](../transcription/README.md) owns the speech-to-text
providers. The environment is the unnamed default profile:

| Variable | Default | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `none` | Env-default provider when no route resolves. |
| `LLM_BASE_URL` | — | Server base; **required** — never defaulted. |
| `LLM_API_KEY` | — | Optional key (many local servers run open). |
| `LLM_MODEL` | — | Model id; **required** — never defaulted. |

Completion paths canonicalize: a base already carrying `/v1` is
stripped and the prefix re-applied (routers reject the root path with
`no_route`), and a first-request missing route falls back once to the
same-dialect root-mounted path, caching the winner per endpoint — never
a cross-dialect wire guess. A route that cannot produce both `baseUrl`
and `model` resolves to `{ provider: 'none' }`: consumers gate the
capability as unavailable at their entry points. Consumers today: the agent AI loop and
wakes (wake rule → conversation → org `chat` route precedence),
meetings call summaries (`chat.summaries`, falling back to `chat`).

## Administration

The organization's models screen (`/organization/models`) owns the model
table: profiles (name,
kind, provider, base URL, model, optional key) and capability routing
(`chat`, `chat.summaries`), saved through `GET/PUT /api/llm/settings`
(gated by organization settings access via
[organizations](../organizations/README.md)
`readSettingsSection`/`updateSettingsSection`). Keys never travel: reads
report `apiKeySet` and a key-free resolved projection; saves keep an
omitted key and clear on empty string. `POST /api/llm/test` runs one real
completion round against one saved chat profile (or the resolved default
route) and reports `{ ok, provider?, model?, reason? }` on failure.
`POST /api/llm/models` probes one endpoint's model listing —
`{ provider, baseUrl, apiKey }` on the body, or a saved `profileId` —
through `listEndpointModels`.

## Service Contract

- `resolveLlmConfig(organizationId, capability, { profileId, model })` → `{ provider, baseUrl?, apiKey?, model? }`; `{ provider: 'none' }` when disabled or unusable. The profile owns the endpoint; a `model` override (the execution point's choice off that endpoint) replaces the served model on the resolved config.
- `chatModels(organizationId)` → `[{ profile, model }]` — the models each chat profile's endpoint actually serves, probed live (both listing shapes) with a short cache; a down endpoint contributes no rows. This is the picker list for chat execution points.
- `isLlmAvailable(organizationId)` → boolean shorthand.
- `chatCompletion({ organizationId, system, messages, tools })` → the
  neutral assistant message `{ content, thinking, toolCalls: [{ id, name,
  arguments }] }`; `messages` are neutral conversation entries (assistant
  entries may carry `toolCalls`, tool results carry `toolCallId` + `name`),
  `tools` are the catalog's `{ name, description, inputSchema }`
  descriptors. `thinking` is the model's reasoning and `content` its
  answer: reasoning that providers ship as a field (Ollama `thinking`,
  OpenAI-shaped `reasoning_content`, Messages `thinking` blocks) is read
  directly, and reasoning that rides inline in the content — qwen3's think
  tags — is split out, so consumers never see tags in `content` and
  persist answers only. Two inline shapes are handled: explicit tag pairs
  anywhere, and the Ollama-compatible OpenAI shape where the chat template
  prefills the open tag, so qwen3-class models (matched by name) deliver
  content that *starts* in reasoning and ends at the close tag. Throws 503
  when unresolved, 502 when the endpoint
  is unreachable, answers non-2xx, or returns no completion. The agent loop
  that owns rounds and tool execution lives with the consumer.
- `streamChatCompletion({ … })` → the streaming twin: an async generator
  yielding `{ type: 'thinking' | 'text', text }` deltas as the model emits
  them (the inline-tag split is stream-aware — a tag split across chunks
  is held back, not split), then one closing `{ type: 'message', content,
  thinking, toolCalls }` — the fully assembled neutral message. A
  reasoning-first stream that never meets a close tag turns out to be a
  plain answer: its closing message reclassifies (content whole, thinking
  empty), and the agent runtime reconciles its live activity sink with
  that message at round end. Same
  503/502 posture. Takes an optional
  `signal` (AbortSignal): aborting the caller's controller cancels the
  request and the stream — the seam the agent runtime stops a run with.

## Consumers

- The organization AI's chat runtime: the tool-calling loop over the
  shared [agent tool catalog](../agent-bots/README.md), executing
  delegated to the chatting user.
- [Meetings](../meetings/README.md) call summaries: the protocol-markdown
  summarization prompt rides the same provider selection — one LLM
  provider per organization, no per-feature model configuration.
- The organization models screen: provider administration and the
  connection test (see Administration above); the AI's model is the org
  `chat` route, and per-conversation pins live in the chats themselves.
- `GET /api/llm/config` reports `{ available }` for the caller's
  organization so clients render the AI's chat affordances only when a
  provider is actually configured.

## Related

- [Agent bots](../agent-bots/README.md)
- [Meetings](../meetings/README.md) — call summaries on the shared provider
- [Transcription](../transcription/README.md) — the config pattern this module mirrors
- [API routes](../../api/README.md)
