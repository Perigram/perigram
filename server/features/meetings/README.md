# COMPONENT: Meetings

Meetings turn finished call recordings into conversation content: the
recording's audio is transcribed through the
[transcription feature](../transcription/README.md) and an org-owned
protocol (a markdown instruction file) summarizes the transcript through
the organization's shared [LLM provider](../llm/README.md), posting the
summary into the call's conversation. It owns no collection — the pipeline
is triggered by the
[livekit feature](../livekit/README.md#recordings) after a recording
imports, and results land as support messages.

## Pipeline

```
recording imported (livekit) → GridFS mp4 → transcribeAudio (per-org STT)
    → transcript → chatCompletion (system = protocol markdown, user = transcript)
    → summary message in the conversation, sender = org bot user
```

The pipeline is best-effort: a disabled config, an unavailable LLM
provider, or an empty transcript skips the summary silently (the recording
message itself already landed). Speaker attribution is not available yet —
the deployed local STT is single-speaker, so multi-party call transcripts
are flat text; diarization is the upgrade path.

## Configuration

The chat model is the organization's LLM provider selection
(`data.settings.llm` / `LLM_*` — see the [llm feature](../llm/README.md));
meetings adds only its own concerns at `data.settings.meetings` (the
standard organization `data` merge):

```json
{ "enabled": true, "protocolFileId": "<gridfs id>", "botUserId": "<user id>" }
```

`protocolFileId` references a markdown file uploaded through the
[files feature](../files/) — its content becomes the model's system
instruction, so each org authors what the summary must contain and how it
reads. Without one, a neutral default instruction is used. `botUserId` is
the user the summary posts as (create a bot member through the
[agent bots](../agent-bots/README.md) panel); it falls back to the
recording starter. `enabled: false` opts an organization out beside a
working provider; no resolvable provider disables summaries everywhere.

## Service Contract

- `resolveMeetingsConfig(organizationId)` → `{ enabled, protocol, botUserId }`; `{ enabled: false }` when the provider is unavailable or the org opted out.
- `summarizeRecording({ record, message })` → posts the summary message or returns `null`; never throws — summary failures log and leave the recording message intact. `record` is the `call_recordings` document, `message` the imported recording message (attachment fileId is the audio source).

Organization resolution follows the recording: group conversations use the
group's organization lineage; direct conversations the recording starter's
membership.

## Related

- [LiveKit recordings](../livekit/README.md#recordings)
- [Transcription](../transcription/README.md)
- [Support attachments](../support/README.md#message-attachments)
