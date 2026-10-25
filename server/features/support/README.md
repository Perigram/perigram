# COMPONENT: Support Chat

Support chat is a capability module backed by the `supportMessages`
collection. API routes delegate message normalization and conversation
selection to `service.js`; `repository.js` owns raw MongoDB access.
Realtime delivery rides the shared connections layer
([connections feature](../connections/README.md)): message and read
events publish to `conversation:<key>` topics, inbox pings to
participant `user:` topics, and support-channel changes to the
`admin-support` topic.

Parent: [server/features](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Conversation Contract

Messages have a deterministic `conversationKey`:

| Kind | Key | Participants |
|---|---|---|
| User to support | `support:<userId>` | The customer user id |
| User to user | `direct:<sorted-user-id-a>:<sorted-user-id-b>` | Both user ids, sorted |
| Group chat | `group:<chatGroupId>` | The persisted group's member ids |
| Instance chat | `instance:<typeId>:<instanceId>` | The sender (org-scoped read) |

| Concern | Fields |
|---|---|
| Always persisted | `conversationKey`, `conversationKind`, `participants`, `senderUserId`, `message`, `instanceRefs`, `timestamp` |
| Optional persisted | `attachments` ([Message Attachments](#message-attachments)), `forwardedFrom` ([Forwarding](#forwarding)), the reply `parent` quote ([Replies](#replies)), `instanceLink`/`instancePath` ([Instance-Linked Chats](#instance-linked-chats)) |
| Server-authored | `agent` — the bot runtime's run provenance (`{ steps }`, the run's chronology of reasoning segments and tool invocations); `notice` — a machine-output severity name (PrimeVue Message severity, e.g. `error`/`warn`) carried by the agent's failure replies so clients render severity-styled notices |

Server-authored fields are written through the service seam and
stripped from client-posted bodies.

### Inbox Preferences and Read Marks

Per-user pin/archive preferences live in the `supportConversationPrefs`
collection (one document per user and conversation; `pinnedAt`/
`archivedAt` timestamps double as existence flags). Every conversation
snapshot row is decorated with `pinned` and `archived` booleans plus
`lastMessageRead` — true only when the row's newest message is the
viewer's own and at least one other participant's read cursor
(`supportConversationReads`) is at or after it. `POST
/api/support/prefs` upserts a preference for a validated conversation
key; the flags are private to the user, so updates publish no connection
events and clients patch their local rows from the response.

### Lazy History

`GET /api/support/messages` is paginated: `limit` (default 50, capped
at 100) selects the newest page and `before` (an ISO timestamp cursor)
selects the page older than that cursor, both still returned in
ascending order with `hasMore: data.length >= limit`. History responses also carry
`readCursors: [{ userId, lastReadAt }]` for the conversation
participants, captured before the endpoint marks the viewer read — the
thread-side seen marks and the unread divider derive from them. The composer
loads the newest page on open and prepends older pages keyed on the
oldest loaded timestamp while preserving the reader's scroll position;
realtime message events keep appending to the live end.

Direct user conversations are open between any two accounts: the direct
thread is the platform's contact channel, and the recipient merely has
to exist (directory discovery matches display names only). Admin
support routes stay scoped to support conversations and skip direct
user threads. An explicit recipient equal to the authenticated user
creates the deterministic `direct:<userId>:<userId>` self-conversation;
only a missing recipient selects the customer-support channel.

### Message Search
`GET /api/support/search` scans one conversation the caller can read:
`q` (case-insensitive substring on the message body), `sender`
(participant user id), `attachmentKind` (`image`|`video`|`audio`|`file`),
newest first, capped at 50 rows of the message projection. Results drive
the in-thread jump: a hit older than the loaded page loads its
surrounding history through one timestamp-anchored request.

## Group Chats

Group chats unify multi-user chat with LiveKit calls: each group is a
persisted `chat_groups` document (canonical `identity`, `status`/
`origin`, org `lineage`, plus a `participants` user-id list) and owns
the derived `call:group:<groupId>` room minted by the
[livekit feature](../livekit/README.md).

- `POST /api/support/groups` creates one (`{ name, participantIds }`);
  participants are user-scope — any existing account may join, unknown
  ids are rejected with an error, and the creator is
  always included. The group itself stays homed in the creator's
  organization lineage. Creation pings every participant's inbox topic.
  Membership edits on an existing group go through the service seams
  (`addGroupParticipant`/`removeGroupParticipant`, creator-or-admin
  gated, the creator irremovable; the human seams refuse bot targets
  outright, so the participants entry and the AI's subscription cannot
  diverge through member management) — and assistant membership through
  the participant-gated twins (`addBotGroupParticipant`/
  `removeBotGroupParticipant`: any participant holding the agent-chat
  capability may seat or remove the AI, and the assistant is the only
  valid target) — driven by the
  [agent bots](../agent-bots/README.md) subscription endpoint when the
  AI joins or leaves a group chat.
- `DELETE /api/support/groups/:id` removes one; the creating member or
  an admin may delete. The route also drops the room's AI subscription
  rows (`onGroupDeleted` in [agent bots](../agent-bots/README.md)) so
  deleted rooms — AI chat threads included — stay silent.
- Group conversations appear in the user's inbox through
  `GET /api/support/conversations`, including groups without messages
  yet; summaries carry `groupName`, `groupId`, and `groupCreatorId`,
  and message/read/typing events ride `conversation:group:<id>` with
  the same participant admission as direct threads.
- Messaging a group passes `conversationKey: "group:<id>"` to
  `GET/POST /api/support/messages`.

Conversation read state is stored in `supportConversationReads` as
`{ conversationKey, userId, lastReadAt, updatedAt }`. Conversation
lists compute unread counts from messages sent after `lastReadAt` by
another sender. The Chats inbox starts a direct thread explicitly
through its user picker, keeping empty conversations uncreated until a
first message. Conversation summaries include the last message's
`instanceRefs` and `attachments` so the inbox can render instance chips
and one attachment summary in message previews (files first, then
refs). Each row carries its own `unreadCount` (the per-row badge in the
inbox's pin slot); the app-shell badge keeps the organization-wide
total across conversations.

## Inline Instance References

Chat messages can carry structured `instanceRefs`:

```json
[{ "type": "cassette", "id": "..." }]
```

Instance refs resolve preview media over their snapshot (a served
plugin preview binding, a renderable stored payload, or a declared
geometry value — the channels the shared preview mounts); refs with
media render `InstanceInlineRef`'s compact card, preview-less refs
render the outlined chip (type glyph), and file documents render the
filled chip. Images and video embed inline; other files open the shared
preview dialog on click (download for opaque kinds). Every instance ref
opens the shared record popup (`EntityPopup` — the record's compiled
detail screen, or the record floor for types without a compiled
screen). The full attachment/ref rendering contract (stacking, chips,
previews, the record popup) is owned by
[components/shared](../../../components/shared/README.md). Inline
`{{instance:type:id}}` tokens inside authored text strip from display.
The chat composer stores selected instances only in `instanceRefs` and
injects no attachment tokens into the message body. Ref labels carry
the stored name slot only, empty when unnamed; surfaces resolve the
record title client-side (`instanceRecordTitle` over the snapshot, the
identifier row) and fall back to the localized type label for empty
names (the naming law under
[Instance-Linked Chats](#instance-linked-chats)).

Instance ref types come from readable generated screen sources in the
current `auth.screens` process manifest. `GET /api/support/instance-types`
is therefore a generated-scope endpoint, and includes any non-`single`
source whose requirement is satisfied at read level or stronger.

Ref validation at persistence keys on the validating principal's
rights, which may differ from the sender's byline: a send is attributed
to one principal but may carry another's validation rights via
`sendUserMessage`'s `refsAuth` option — an agent run posts its reply as
the assistant while its attached refs validate under the delegating
user's auth (the same rights the user would attach with; the assistant
holds no process roles of its own). Refs the validating principal cannot
read drop silently at persistence. The support service resolves the
sender through the active process runtime before deriving those
sources, so ref validation uses the same generated auth window as the
rest of the app. Composer UIs localize returned type ids on the client.

`GET /api/support/instance-options` is the server-side ref resolution
channel: message-write validation, draft hydration, create-prompt field
options, and conversation-context resolution all read instance options
through one per-type loader seam. A concrete loader is registered for
`user`; every other type — pack, plugin, and org-authored CTS types —
resolves its scoped list through the registry-resolved per-class
instance service (`processList`, CTS SPEC §13; see
[instances](../instances/README.md)), so every type is pickable and
linkable in chats. Option loads use those generated source filters when
they are concrete. Because the endpoint is keyed by `type` alone, each
attachment type uses the first readable generated
source exposed by `instance-types`; support serves one picker row per
instance type. For detail-child list sources that still depend on
`$screen.instanceId` / `$screen.scope.instanceId`, the support service
expands the child query across the sender's readable parent instances
for that screen, keeping the result bounded. Generated detail `single`
sources are excluded as attachment-option loaders, so a detail route
cannot widen a picker past the process list windows that actually
expose that instance type. The chat attachment picker tree itself loads
the same compiled home-screen list sources the home sidebar renders
(see [ChatAttachmentPicker](../../../components/shared/README.md)).

For direct chats, the instance-options endpoint also evaluates the
recipient's resolved process auth and marks options the recipient cannot
read through their own access contract; the composer renders those as
chat-only warnings. When such a ref is sent, the stored `instanceRefs[]`
entry keeps a compact instance snapshot plus `chatOnlyForRecipient=true`,
so the recipient can still inspect that instance inside chat with no
generated-screen access granted. Snapshots are contract-driven (SPEC §4
`snapshot` facet): a type that declares snapshot paths keeps exactly
those, resolved through the registry view — pack and org declarations
alike, with per-type branches confined to declarations (the cassette
declaration carries the thumbnail-critical geometry paths because
direct-chat inline cards render from the stored snapshot; types without
the facet get the generic compact strip, and heavy geometry layers stay
off previews). Message writes drop unsupported or unreadable refs.
Messages may contain only attachments; an empty body is valid as long
as at least one instance ref survives write-time validation. Agent bots
attach through the same seam: the chat tool `attach_instances`
validates refs with `normalizeInstanceRefs` against the bot's auth, and
the reply send re-validates identically to a composer send.

### Creator-only sources

A type with no readable list source is still attachable when the org
process exposes a create action for it: a `createInstance` action whose
inputs carry a `creator` with an `upload`/`capture`/`editor` attachment
kind (the payload-trait projection keyed by type id) exposes the
creator's type as a creator-only source. This is what lets the chat
attachment picker run the type's create flow and reference the freshly
created instance, while reads stay inside the process windows: option
loading for the type still goes through the scoped per-class list
service.

## Instance-Linked Chats

Messages may be linked to one instance (`instance: { type, id }` on
send). The server resolves the instance through the auth-scoped
registry read (`processGetById`), persists `instanceLink
{type,id,name}`, and walks the lineage bindings upward to persist
`instancePath [{type,id,name}]` with the organization root first, every
ancestor, then the linked instance. Instance messages also carry
`organizationId`, which scopes the inbox query and the
organization-topic fanout. Chats over instances are composed views over
one thread space:

- Narrow view: `GET /api/support/messages?instance=<type>:<id>&includeChildren=0`
  matches the instance's own conversation key.
- Composed view (default): `includeChildren=1` matches any message whose
  `instancePath` contains the instance, so a top-level chat lists the
  top instance plus every descendant message.

Authorization resolves the instance through the process-scoped registry
read, falling back to every generated source of the type and, finally,
to the exists-but-denied registry answer (403 vs 404): instances the org
process owns but whose grants deny reads still admit chats with a bare
link and an organization-only path. Truly unknown instances yield
`403`. Realtime fanout publishes the message event to every
`conversation:instance:*` topic along the instance path (aggregated
views stay live through one subscription) plus one `org:<id>` inbox
ping. The user inbox query includes
`{ conversationKind: 'instance', organizationId }` so org-mates see
each other's instance messages. Inbox instance chats ship one row per
messaged instance (the organization chat included), each carrying the
conversation key of its nearest row-bearing ancestor as `parentKey`;
the inbox client groups rows into per-organization folder chips through
that ancestry (the inbox presentation contract lives in
[components](../../../components/README.md)). Row labels resolve live
from the instance record; stored link names survive only when they are
current names, and empty names localize the type label client-side.
Unread counts land on a row and on every ancestor row (roots aggregate
their subtree, like the composed thread views); shell unread totals
count root rows only. Instance labels are identity names only
(`identity.name`/`serial`): surfaces fall back to the localized type
label when a name is empty. Rollup nodes are the top-level nodes of the
lineage hierarchy trees: each message joins at the ancestor whose type
carries no non-organization parent binding. The walk uses live lineage
(instance lineage keys plus the compiled bindings through the registry
read), since the stored `instancePath` can be degraded when ancestors
failed to resolve at send time. Names denormalize into the path, so
quotes and inbox rows read them directly.

### Replies

A send may carry `parentMessageId`. The parent must share the
conversation key or, for instance messages, the same organization (an
aggregated view can reply to a message linked to a child instance); the
composer links the reply to the same instance the quoted message
belongs to. The reply persists a denormalized `parent { _id,
senderUserId, senderName, snippet, attachments?, instanceRefs?,
timestamp }` quote (text clipped to 140 characters; voice messages carry
their attachment descriptor), so rendering and inbox previews never
need the parent loaded. Quotes of text messages show the snippet; quotes
of media or ref messages render the attachment/ref summary line through
`MessageAttachments` single-line (the same summary the inbox preview
uses), and the composer draft resolves the quoted sender through the
shared user chip.

## Message Attachments

A message may carry `attachments` — an ordered list of file descriptors
(capped at ten per message):

```json
[{ "kind": "image", "fileId": "<gridfs id>", "mimeType": "image/png", "name": "facade.png", "size": 120034 }]
```

Every descriptor carries `kind`, `fileId`, and `mimeType`; uploaded
files add `name`/`size`, voice messages add `durationSeconds` (clamped
to ten minutes). Kinds derive from the file's MIME family: `image`,
`video`, `audio`, `file`. Blobs upload through the
[files feature](../files/) into the `files` GridFS bucket (the SPEC §3
Blob home — the same bucket instance payloads live in, so a descriptor's
file is directly usable as a payload reference); the optional `bucket`
key marks blobs left in the `uploads` bucket. Previews, playback, and
downloads stream through the shared `/api/files/download/:id` route
(`?download=1` for an explicit download; single byte ranges answer
`206` so video playback and seeking work); big files upload through
resumable chunk sessions with per-chunk progress (see
[api routes](../../api/README.md) → files, driven by the
`useChatFileUpload` client transport). Message documents keep media
bytes in GridFS only. Call recordings imported by the
[livekit feature](../livekit/README.md#recordings) are server-authored
`video` attachment-only messages posted from the recording starter;
every other attachment is user-uploaded through the composer (voice
messages included — recorded through `MediaRecorder`, sent as `audio`
descriptors; images may also be pasted from the clipboard, dragged onto
the thread's drop area, or captured with the device camera beside
upload — all staging through the same path as picked files, caps and
instance-chat gating included). Attachment-only messages are valid
(empty body). Reply quotes persist the parent's attachments.

### Instance chats materialize files as child instances

A message linked to an instance and carrying user-uploaded attachments
materializes each file as an instance of the linked instance's type's
declared child that accepts it: a `file`-class child type whose payload
traits accept the attachment's MIME type and size and whose creation
protocols include `upload` (the same acceptance rule the generic
construct boundary enforces — `payloadAccepts` in
[packages/cts](../../../packages/cts/README.md)). The send creates the
child through the registry-resolved per-class service's `upload`
construction handler with the attachment as payload and the chat's
composer-target instance stamped on the child edge's lineage key, then
appends the created instance (with its compact snapshot) to the
message's `instanceRefs`, so the bubble shows the file as an inspectable
entity while the message itself stays linked to the composer target —
galleries, replies, and composed instance views keep working unchanged.
When several children accept the same file the client sends the
sender's chosen `targetTypeId` per attachment; the server validates the
choice against its own candidate set and rejects an ambiguous send that
carries none. A composer target whose type declares no accepting child
refuses the upload: the composer's file input accepts only the union of
candidate `accept` lists (the early check), and a write carrying an
unmatched file is rejected with 400. Person conversations (support,
direct, group) and chats over party-class targets (the organization
chat — party classes cannot declare lineage children) keep files as
plain unlinked attachments.

### Transcription

`POST /api/support/messages/:id/transcribe` converts a voice message
into text through the [transcription
feature](../transcription/README.md) **for the calling user only**: the
transcript persists per user in the `supportTranscripts` collection
(one document per message and viewer) and leaves the shared message
document untouched. Reads merge the caller's transcripts onto every
message page (`transcript` on the DTO, viewer-scoped), so reply quotes,
inbox previews, and other viewers' bubbles — which read the authored
body — skip it. Admission reuses the conversation context
resolution (the same check that authorizes SSE topics), and only
single-attachment `audio` messages qualify (call-recording `video`
attachments are multi-speaker and excluded): no attachments, an
existing transcript for this viewer, or a non-empty message body are
rejected with 400/409. On success the endpoint returns the updated DTO
with `transcript` set; the change is private to the viewer, so no
conversation event is published. The provider is resolved per
organization (`message.organizationId`, falling back to the caller's),
so org transcription settings decide between the local and cloud
endpoints.

### Forwarding

`POST /api/support/messages/:id/forward` (`{ conversationKey }`)
re-sends a message into another conversation: the forwarder sends a
fresh message carrying the source's text and attachment descriptors
(same GridFS files, `targetTypeId` choices re-validated against the
target's accepting children on instance chats — an ambiguous match
lacking a choice is rejected like any send). Instance refs stay
behind: they describe the source conversation's context. The source
must be readable by the caller
(conversation context resolution) and the target must admit the caller
as a send target; the new message denormalizes `forwardedFrom
{ senderUserId, senderName, sentAt }` so a forwarded-from header line —
rendered above the message content on every shape, text, media, or
files — names the original sender with no joins.
## Server-side message observers

`registerMessageObserver(fn)` is the in-process seam for server
consumers of persisted messages: observers receive `(context, message)`
after the write has fanned out through the connections layer, run
outside the send path (failures are logged; the sender proceeds
unaffected), and may return promises the seam tracks. The
[agent bots](../agent-bots/README.md) runtime registers the chat-bot
trigger this way — the support feature stays bot-agnostic.

## The AI member in chats

The organization's assistant (the user carrying the `data.bot` marker —
see [agent bots](../agent-bots/README.md)) is the AI's attribution
identity: direct threads with it are ordinary direct conversations (it
floats first in the new-chat picker, capability-gated), group
membership rides the participants list, and instance (organization)
chats admit it through org-scoped reads. AI replies re-enter
`sendUserMessage` with the assistant's auth context but execute with
the triggering user's access (delegation, SPEC: agent access); delivery
rides the same conversation channels as every other message.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/support/conversations` | Snapshot of the current user's support/direct/group conversation list with unread counts. |
| `POST /api/support/groups` | Creates a group chat (`{ name, participantIds }`). |
| `DELETE /api/support/groups/:id` | Deletes a group chat (creator or admin). |
| `POST /api/support/read` | Marks an authorized conversation read for the current user. |
| `POST /api/support/prefs` | Saves per-user conversation preferences (`{ conversationKey, pinned?, archived? }`); returns the saved `{ pinned, archived }`. |
| `GET /api/support/instance-types` | Returns generated-screen instance source types readable by the current user. |
| `GET /api/support/instance-options?type=<type>&q=<query>&recipientUserId=<id>` | Returns readable instance options for chat attachment refs and flags recipient chat-only visibility for direct chats. |
| `POST /api/support/typing` | Ephemeral typing signal; authorized like a read, published to the conversation topic, discarded after publish. |
| `GET /api/support/messages` | REST snapshot of the current user's support conversation; changes arrive over the connections stream. Message pages carry the caller's private transcripts (`transcript`, viewer-scoped). |
| `GET /api/support/messages?recipientUserId=<id>` | REST snapshot of a direct user conversation. |
| `GET /api/support/messages?conversationKey=group:<id>` | REST snapshot of a group conversation. |
| `GET /api/support/messages?limit=<n>&before=<iso>` | Lazy history page: the `n` newest messages older than the cursor, ascending, plus `hasMore`. |
| `GET /api/support/messages?instance=<type>:<id>&includeChildren=<0|1>` | Instance thread view: composed subtree (default) or the instance's own messages. |
| `POST /api/support/messages` | Send support, direct (`recipientUserId`), group (`conversationKey`), or instance (`instance {type,id}`) message; optional `parentMessageId` reply quote. Publishes `message`/`read`/inbox events through the connections layer. |
| `POST /api/support/messages/:id/transcribe` | Transcribes an authorized voice message into the caller's private transcript (per-user storage; the shared body stays unchanged). |
| `POST /api/support/messages/:id/forward` | Forwards an authorized message's text and attachments into another conversation as a fresh send carrying `forwardedFrom` provenance. |
| `GET /api/support/admin/:user_id` | REST snapshot of the admin support conversation. |
| `POST /api/support/admin/:user_id` | Admin reply to a customer support conversation. |
| `GET /api/support/admin/chatlist` | Admin support-thread list snapshot; excludes direct user conversations. Refreshes via the `admin-support` connections topic. |

## Related

- [API routes](../../api/README.md)
- [Users](../users/README.md)
- [Shared components](../../../components/shared/README.md)
