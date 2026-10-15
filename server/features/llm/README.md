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

There is **no default base URL** — no provider ever implies a cloud
endpoint. `provider: 'none'` (the default) disables the LLM everywhere.

## Configuration Resolution

Per-organization selection lives on the organization document at
`data.settings.llm` (writable through the standard organization update's
`data` merge, readable by org admins):

```json
{ "provider": "ollama", "baseUrl": "http://llm.host:11434", "model": "qwen3:32b" }
```

`provider` is required (`ollama` | `anthropic` | `openai` | `none`);
`baseUrl`, `apiKey`, and `model` are optional per-org overrides.
Environment defaults fill every unset slot:

| Variable | Default | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `none` | Provider when the org sets none. |
| `LLM_BASE_URL` | — | Server base; **required** — never defaulted. |
| `LLM_API_KEY` | — | Optional key (many local servers run open). |
| `LLM_MODEL` | — | Model id; **required** — never defaulted. |

A provider without both `baseUrl` and `model` resolves to `none`:
consumers treat the LLM as unavailable rather than failing per request
(the same posture as [transcription](../transcription/README.md)).

## Administration

The organization's bots screen owns provider setup
(`GET/PUT /api/llm/settings`, gated by organization settings access
through [organizations](../organizations/README.md)
`readSettingsSection`/`updateSettingsSection`): provider, base URL,
model, and an optional key write to `data.settings.llm` — the same
contract the env defaults fill. Keys never travel: reads report
`apiKeySet` (and the resolved config ships without the key), an omitted
key on save keeps the stored one, an empty string clears it. A selected
provider requires base URL and model. `POST /api/llm/test` performs one
real completion round against the resolved provider and reports
`{ ok, provider?, model?, reason? }` instead of throwing — the card's
connection test.

## Service Contract

- `resolveLlmConfig(organizationId)` → `{ provider, baseUrl?, apiKey?, model? }`; `{ provider: 'none' }` when disabled or unusable.
- `isLlmAvailable(organizationId)` → boolean shorthand.
- `chatCompletion({ organizationId, system, messages, tools })` → the
  neutral assistant message `{ content, toolCalls: [{ id, name,
  arguments }] }`; `messages` are neutral conversation entries (assistant
  entries may carry `toolCalls`, tool results carry `toolCallId` + `name`),
  `tools` are the catalog's `{ name, description, inputSchema }`
  descriptors. Throws 503 when unresolved, 502 when the endpoint is
  unreachable, answers non-2xx, or returns no completion. The agent loop
  that owns rounds and tool execution lives with the consumer.

## Consumers

- Agent bots' chat runtime: the tool-calling loop over the shared
  [agent tool catalog](../agent-bots/README.md).
- [Meetings](../meetings/README.md) call summaries: the protocol-markdown
  summarization prompt rides the same provider selection — one LLM
  provider per organization, no per-feature model configuration (the
  retired `MEETINGS_LLM_*` env and per-feature baseUrl/model/apiKey
  settings moved here in the same change).
- The organization bots screen: provider administration and the
  connection test (see Administration above).
- `GET /api/llm/config` reports `{ available }` for the caller's
  organization so clients render bot affordances only when a provider is
  actually configured.

## Related

- [Agent bots](../agent-bots/README.md)
- [Meetings](../meetings/README.md) — call summaries on the shared provider
- [Transcription](../transcription/README.md) — the config pattern this module mirrors
- [API routes](../../api/README.md)
