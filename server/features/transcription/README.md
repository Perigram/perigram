# COMPONENT: Transcription

Transcription is a capability module: it turns stored audio into text through
an OpenAI-compatible speech-to-text endpoint. It owns no collection — audio
bytes already live in the [files feature](../files/) (GridFS) and results are
persisted by the consuming feature (support chat stores the transcript
per user in its own collection).

## Providers

Each provider has its own wire protocol:

| Provider | Endpoint source | Use |
|---|---|---|
| `local` | `TRANSCRIPTION_LOCAL_BASE_URL` | Self-hosted speech-to-text reachable from the app container (for example over the NetBird mesh). |
| `cloud` | `TRANSCRIPTION_CLOUD_BASE_URL` (default `https://api.openai.com/v1`) | Any OpenAI-compatible hosted API; requires an API key. |

`provider: 'none'` (the default) disables transcription everywhere.

### Local protocol

`POST {baseUrl}/transcribe` with multipart fields `file` (audio blob with
filename) and the optional `language` hint (ISO code, e.g. `ru`; omitting it
lets the service auto-detect the language — the literal value `auto` is not
accepted server-side). The
response carries per-segment results — the app transcript is the segment
texts joined with spaces:

```json
{
  "language": "ru",
  "duration_s": 12.3,
  "rtf": 0.08,
  "segments": [{ "start": 0, "end": 2.1, "text": "…", "words": [] }],
  "speakers": []
}
```

An empty `segments` array is an empty transcript. The service has no
model parameter: `transcribeAudio` returns `model: ''` for local runs
(the consuming feature persists it with the per-user transcript). `TRANSCRIPTION_LOCAL_API_KEY` is optional and only sent when set.

### Cloud protocol

`POST {baseUrl}/audio/transcriptions` with multipart fields `file` and
`model`, bearer authorization, and a `{ "text": "…" }` JSON response.

## Configuration Resolution

Per-organization selection lives on the organization document at
`data.settings.transcription` (writable through the standard organization
update's `data` merge, readable by org admins):

```json
{ "provider": "local", "language": "ru" }
```

`provider` is required (`local` | `cloud` | `none`); `language`, `model`,
`baseUrl`, and `apiKey` are optional per-org overrides (`language` applies to
the local protocol, `model` to the cloud protocol). Environment defaults fill
every unset slot:

| Variable | Default | Meaning |
|---|---|---|
| `TRANSCRIPTION_PROVIDER` | `none` | Provider when the org sets none. |
| `TRANSCRIPTION_LOCAL_BASE_URL` | — | Local endpoint base; no default. |
| `TRANSCRIPTION_LOCAL_API_KEY` | — | Optional local endpoint key. |
| `TRANSCRIPTION_LANGUAGE` | — | Optional local language hint (ISO code). |
| `TRANSCRIPTION_CLOUD_BASE_URL` | `https://api.openai.com/v1` | Cloud endpoint base. |
| `TRANSCRIPTION_CLOUD_API_KEY` | — | Cloud API key; required for cloud. |
| `TRANSCRIPTION_MODEL` | `whisper-1` | Cloud model unless the org overrides it. |

A selected provider that cannot work — `local` without any base URL, `cloud`
without a key — resolves to `none`: `resolveTranscriptionConfig` returns
`{ provider: 'none' }` and every consumer treats transcription as
unavailable, so requests proceed with transcription off.

## Service Contract

- `resolveTranscriptionConfig(organizationId)` → `{ provider, baseUrl?, apiKey?, model?, language? }`; `{ provider: 'none' }` when disabled or unusable.
- `isTranscriptionAvailable(organizationId)` → boolean shorthand for consumers deciding whether to surface transcription UI.
- `transcribeAudio({ buffer, filename, mimeType, organizationId })` → `{ text, provider, model }` — `model` is empty for the local protocol. Throws 503 when unresolved, 502 when the endpoint is unreachable or answers non-2xx, and returns empty `text` when the result carries no speech (empty segments locally, empty cloud text); the caller decides what that means.

Retries stay with the user: callers surface the error, and the user can
retry manually.

## Consumers

- Support chat voice messages: `POST /api/support/messages/:id/transcribe`
  stores the transcript per user, leaving the shared message document
  untouched (see [support](../support/README.md#transcription)).
- `GET /api/transcription/config` reports `{ available }` for the caller's
  organization so clients render transcription affordances only when a
  provider is actually configured.

## Related

- [Support chat](../support/README.md)
- [Files feature](../files/)
- [API routes](../../api/README.md)
