```yaml
doc_id: SERVER-FEATURES-SUPPORT-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Support Chat

The support surface: conversations between users, the organization
assistant, support staff, groups, and instances, with attachments,
instance references, per-user transcripts, and forwarding. Consumers:
chat UIs ([components/shared](../../../components/shared/README.md)),
the agent runtime, livekit, transcription.

Parents: [features README](../README.md) · [features SPEC](../SPEC.md). Consumed contracts:
[connections](../connections/README.md) (topics/SSE), the files feature
(GridFS), [transcription](../transcription/README.md),
[agent-bots](../agent-bots/README.md), [livekit](../livekit/README.md),
[instance-events](../instance-events/README.md).

## Contracts owned here

### Conversations

| Kind | Key | Admission |
|---|---|---|
| User → support | `support:<userId>` | the customer user id |
| Direct | `direct:<sorted-a>:<sorted-b>` | any two existing accounts; an explicit self-recipient opens the self-conversation; a missing recipient selects support |
| Group | `group:<chatGroupId>` | the persisted group's member ids |
| Instance | `instance:<typeId>:<instanceId>` | org-scoped read |

Messages persist `conversationKey`, `conversationKind`, `participants`,
`senderUserId`, `message`, `instanceRefs`, `timestamp`, and optionally
`attachments`, `forwardedFrom`, `agent` (bot run provenance `{ steps }`),
`notice` (agent-failure severity) — the last two server-authored,
client-posted copies stripped, media bytes carried zero times. Direct
threads are the platform's contact channel; matching is display-name-only.

### Inbox, reads, history

- Prefs (`supportConversationPrefs`, existence-flag timestamps) decorate
  rows with `pinned`, `archived`, `lastMessageRead`; read cursors
  (`supportConversationReads`, `{ conversationKey, userId, lastReadAt }`)
  count other-sender messages after the cursor.
- `GET /api/support/messages` paginates newest-first: `limit` (default
  50, cap 100), `before` (ISO cursor) pages older ascending, `hasMore:
  data.length >= limit`.

- History responses carry `readCursors: [{ userId, lastReadAt }]` for
  the conversation's participants; the `read` event
  `{conversationKey, userId, at}` keeps cursors live in open threads.
### Search
`GET /api/support/search` scans one conversation the caller can read:
`q` (case-insensitive substring on the message body), `sender`
(participant user id), `attachmentKind` (`image`|`video`|`audio`|`file`),
newest first, capped at 50 rows of the message projection; absent
filters match the whole conversation.
### Groups

A `chat_groups` document (canonical blocks + `participants` user ids)
owns the derived `call:group:<groupId>` room (livekit mints it). Creation
validates participant ids (unknown rejected, creator included, homed in
the creator's organization lineage) and pings every participant inbox.
Human seams `addGroupParticipant`/`removeGroupParticipant`:
creator-or-admin, creator irremovable, bot targets refused.
Participant-gated twins `addBotGroupParticipant`/
`removeBotGroupParticipant`: agent-chat capability, assistant the sole
valid target. Deletion (creator or admin) drops the room's AI
subscription rows.

### Instance references

`instanceRefs: [{ type, id, snapshot? }]`; display strips inline
`{{instance:type:id}}` tokens.

| Facet | Law |
|---|---|
| Admission | Ref types come from readable generated-screen sources in the current `auth.screens` manifest (`GET /api/support/instance-types` is a generated-scope endpoint). Writes validate each ref under rights supplied by `sendUserMessage`'s `refsAuth` option — an agent run posts as the assistant while its refs validate under the delegating user's auth; unreadable refs drop silently; an attachments-only message is valid while one ref survives. |
| Options | One loader seam per type — `artifact` and `user` carry concrete feature-list loaders; every other type resolves through the registry-resolved per-class instance service's `processList` (CTS §13), so every declared type is pickable. The endpoint keys on `type`, uses the type's first readable generated source, and expands `$screen.instanceId`-scoped child sources across the sender's readable parents. |
| Recipients | Direct-chat options the recipient cannot read carry `chatOnlyForRecipient: true` with a compact snapshot (SPEC §4 `snapshot` facet: contract-declared paths via the registry view; the recipient inspects inside chat). A readable artifact list source whitelists the artifact type, as does a compiled artifact-creation action; option loading stays on the scoped list service. |

### Instance chats

A send linked to an instance resolves through the auth-scoped registry
read, persists `instanceLink {type,id,name}` and `instancePath
[{type,id,name}]` (organization root first), and carries
`organizationId`. Views: narrow (the instance's own key) and composed
(`includeChildren=1`, every message whose path contains the instance).
Authorization falls back registry read → every generated source of the
type → the exists-but-denied registry answer; fanout publishes along
every `conversation:instance:*` topic on the path plus one org inbox
ping. Inbox rows ship one per messaged instance with `parentKey`
(nearest row-bearing ancestor) and subtree-aggregated unreads; rollup
nodes resolve through live lineage. Labels are identity names only.

### Files

`attachments: [{ kind, fileId, mimeType, name?, size?, durationSeconds? }]`,
capped at ten; kinds derive from the MIME family. Blobs upload through
the files feature into the `files` GridFS bucket; playback streams
through `/api/files/download/:id` with byte ranges (206); large files
ride resumable chunk sessions. Call recordings arrive as server-authored
`video` attachment messages. Instance-chat sends materialize each
user-uploaded file as an instance of the linked type's declared accepting
child (`file`-class, payload traits accepting the MIME/size, `upload`
creation protocol), appended to `instanceRefs`; the sender picks
`targetTypeId` when several children accept; a type with zero accepting
children refuses the upload. Person conversations and party-class
targets keep files as plain attachments.

### Replies, transcripts, forwarding

| Facet | Law |
|---|---|
| Replies | `parentMessageId` (same key, or same organization for instance aggregates); denormalized `parent` quote — snippet clipped to 140 chars, attachment/ref summary. |
| Transcripts | A qualifying voice message (single `audio` attachment) converts for the calling user only: per-user `supportTranscripts` documents merge onto the caller's pages as `transcript`; provider resolves per organization; the shared message stays authored-body-only. |
| Forwarding | Re-sends text + attachment descriptors as a fresh message carrying `forwardedFrom { senderUserId, senderName, sentAt }`; instance refs stay with the source conversation. |

### Observers and the AI member

`registerMessageObserver(fn)` is the in-process seam for server consumers
of persisted messages (context + message after fanout, outside the send
path, tracked promises); the agent runtime registers its chat trigger
this way. The organization assistant user (`data.bot` marker) is the AI
attribution identity, admitted like any member; replies re-enter
`sendUserMessage` with the assistant's auth executing under the
triggering user's access (delegation, root SPEC §3).

## API

15 routes: `GET /api/support/conversations`; `GET/POST
/api/support/messages`; `POST /api/support/{groups,read,prefs,typing}`;
`DELETE /api/support/groups/:id`; `GET /api/support/{instance-types,
instance-options}`; `POST /api/support/messages/:id/{transcribe,
forward}`; `GET/POST /api/support/admin/:user_id`; `GET
/api/support/admin/chatlist`. The README owns the per-route table.

## Laws

- Topic naming and SSE admission: canonical in
  [connections](../connections/README.md) — this feature publishes, that
  feature admits; cross-device invalidation rides typed entity events
  ([instance-events](../instance-events/README.md)).
- Wire vocabulary is `typeId`/`id`; option and ref payloads carry the
  stored DTO shape with its `identity` block.
- Attachment rendering, masonry layout, and picker trees are client
  contracts: [components/shared](../../../components/shared/README.md).

## End state

The README owns the conversation tables, the loader law, the API table,
and the materialization rule at this precision.
