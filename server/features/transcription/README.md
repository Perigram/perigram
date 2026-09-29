# COMPONENT: Transcription

Transcription is a capability module: it turns stored audio into text through
an OpenAI-compatible speech-to-text endpoint. It owns no collection — audio
bytes already live in the [files feature](../files/) (GridFS) and results are
persisted by the consuming feature (support chat writes the transcript onto
the message document).

## Providers

Both providers speak the same protocol — `POST {baseUrl}/audio/transcriptions`
with multipart fields `file` (audio blob with filename) and `model`, bearer
authorization when a key is configured, and a `{ "text": "…" }` JSON response:

| Provider | Endpoint source | Use |
|---|---|---|
| `local` | `TRANSCRIPTION_LOCAL_BASE_URL` | Self-hosted speech-to-text reachable from the app container (any OpenAI-compatible server: faster-whisper/whisper.cpp frontends, LocalAI, speaches). |
| `cloud` | `TRANSCRIPTION_CLOUD_BASE_URL` (default `https://api.openai.com/v1`) | Hosted API; requires an API key. |

`provider: 'none'` (the default) disables transcription everywhere.

## Configuration Resolution

Per-organization selection lives on the organization document at
`data.settings.transcription` (writable through the standard organization
update's `data` merge, readable by org admins):

```json
{ "provider": "local", "model": "whisper-1" }
```

`provider` is required (`local` | `cloud` | `none`); `model`, `baseUrl`, and
`apiKey` are optional per-org overrides. Environment defaults fill every
unset slot:

| Variable | Default | Meaning |
|---|---|---|
| `TRANSCRIPTION_PROVIDER` | `none` | Provider when the org sets none. |
| `TRANSCRIPTION_LOCAL_BASE_URL` | — | Local endpoint base; no default. |
| `TRANSCRIPTION_LOCAL_API_KEY` | — | Optional local endpoint key. |
| `TRANSCRIPTION_CLOUD_BASE_URL` | `https://api.openai.com/v1` | Cloud endpoint base. |
| `TRANSCRIPTION_CLOUD_API_KEY` | — | Cloud API key; required for cloud. |
| `TRANSCRIPTION_MODEL` | `whisper-1` | Model unless the org overrides it. |

A selected provider that cannot work — `local` without any base URL, `cloud`
without a key — resolves to `none`: `resolveTranscriptionConfig` returns
`{ provider: 'none' }` and every consumer treats transcription as
unavailable rather than failing per request.

## Service Contract

- `resolveTranscriptionConfig(organizationId)` → `{ provider, baseUrl?, apiKey?, model? }`; `{ provider: 'none' }` when disabled or unusable.
- `isTranscriptionAvailable(organizationId)` → boolean shorthand for consumers deciding whether to surface transcription UI.
- `transcribeAudio({ buffer, filename, mimeType, organizationId })` → `{ text, provider, model }`. Throws 503 when unresolved, 502 when the endpoint is unreachable or answers non-2xx, and returns empty `text` when the endpoint transcribes no speech (the caller decides what that means).

Unreachable and failed endpoints never retry here; callers surface the error
to the user, who can retry manually.

## Consumers

- Support chat voice messages: `POST /api/support/messages/:id/transcribe`
  fills the message body with the transcript (see
  [support](../support/README.md#voice-messages)).
- `GET /api/transcription/config` reports `{ available }` for the caller's
  organization so clients render transcription affordances only when a
  provider is actually configured.

## Related

- [Support chat](../support/README.md)
- [Files feature](../files/)
- [API routes](../../api/README.md)
