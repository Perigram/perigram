# COMPONENT: LLM

LLM is a capability module: it turns chat-completion requests into assistant
messages through an OpenAI-compatible endpoint. It owns no collection —
agent state and tool execution live with the consuming feature
([agent bots](../agent-bots/README.md) is the first consumer).

## Configuration Resolution

Per-organization selection lives on the organization document at
`data.settings.llm` (writable through the standard organization update's
`data` merge, readable by org admins):

```json
{ "provider": "openai", "model": "gpt-4o-mini" }
```

`provider` is required (`openai` | `none`, default `none`); `baseUrl`,
`apiKey`, and `model` are optional per-org overrides. Environment defaults
fill every unset slot:

| Variable | Default | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `none` | Provider when the org sets none. |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible chat-completions base. |
| `LLM_API_KEY` | — | API key; required. |
| `LLM_MODEL` | `gpt-4o-mini` | Model unless the org overrides it. |

A selected provider that cannot work — `openai` without a key — resolves to
`none`: `resolveLlmConfig` returns `{ provider: 'none' }` and every consumer
treats the LLM as unavailable rather than failing per request (the same
posture as [transcription](../transcription/README.md)).

## Service Contract

- `resolveLlmConfig(organizationId)` → `{ provider, baseUrl?, apiKey?, model? }`; `{ provider: 'none' }` when disabled or unusable.
- `isLlmAvailable(organizationId)` → boolean shorthand.
- `chatCompletion({ organizationId, messages, tools })` → the assistant
  message (`content` string and/or `tool_calls` array; the caller owns the
  agent loop and tool execution). Throws 503 when unresolved, 502 when the
  endpoint is unreachable, answers non-2xx, or returns no completion.

## Consumers

- Agent bots' chat runtime: the tool-calling loop over the shared
  [agent tool catalog](../agent-bots/README.md).
- `GET /api/llm/config` reports `{ available }` for the caller's
  organization so clients render bot affordances only when a provider is
  actually configured.

## Related

- [Agent bots](../agent-bots/README.md)
- [Transcription](../transcription/README.md) — the config pattern this module mirrors
- [API routes](../../api/README.md)
