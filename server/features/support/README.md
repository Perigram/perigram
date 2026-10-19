# COMPONENT: Support Chat

Support chat is a capability module backed by the `supportMessages`
collection. It is not a v24 instance module, but API routes still delegate message
normalization and conversation selection to `service.js`, while `repository.js`
owns raw MongoDB access. Realtime delivery rides the shared connections layer
([connections feature](../connections/README.md)): message and read events
publish to `conversation:<key>` topics, inbox pings to participant `user:`
topics, and support-channel changes to the `admin-support` topic.

## Conversation Contract

Messages have a deterministic `conversationKey`:

| Kind | Key | Participants |
|---|---|---|
| User to support | `support:<userId>` | The customer user id |
| User to user | `direct:<sorted-user-id-a>:<sorted-user-id-b>` | Both user ids, sorted |
| Group chat | `group:<chatGroupId>` | The persisted group's member ids |
| Instance chat | `instance:<typeId>:<instanceId>` | The sender (org-scoped read) |

New writes always persist
`conversationKey`, `conversationKind`, `participants`, `senderUserId`,
`message`, `instanceRefs`, `timestamp`, and optionally `attachments` (see
[Message Attachments](#message-attachments)), `forwardedFrom` (see
[Forwarding](#forwarding)), `agent` — the bot runtime's run
provenance (`{ steps }` — the run's chronology of reasoning segments and
tool invocations), or `notice` — a machine-output severity name
(PrimeVue Message severity, e.g. `error`/`warn`) carried by the agent's
failure replies so clients render them as severity-styled notices
instead of chat bubbles. Both are server-authored through the service
seam and stripped from client-posted bodies.

### Inbox Preferences and Read Marks

Per-user pin/archive preferences live in the `supportConversationPrefs`
collection (one document per user and conversation; `pinnedAt`/`archivedAt`
timestamps double as existence flags). Every conversation snapshot row is
decorated with `pinned` and `archived` booleans plus `lastMessageRead` —
true only when the row's newest message is the viewer's own and at least one
other participant's read cursor (`supportConversationReads`) is at or after
it. `POST /api/support/prefs` upserts a preference for a validated
conversation key; the flags are private to the user, so updates publish no
connection events and clients patch their local rows from the response.

### Lazy History

`GET /api/support/messages` is paginated: `limit` (default 50, capped at 100)
selects the newest page and `before` (an ISO timestamp cursor) selects the page
older than that cursor, both still returned in ascending order with
`hasMore: data.length >= limit`. The composer loads the newest page on open and
prepends older pages keyed on the oldest loaded timestamp while preserving the
reader's scroll position; realtime message events keep appending to the live
end.

Direct user conversations are open between any two accounts: the direct
thread is the platform's contact channel, and the recipient merely has to
exist (directory discovery remains name-only — emails never leak through
it). Admin support routes remain scoped to support conversations and do
not list direct user threads.
An explicit recipient equal to the authenticated user creates the
deterministic `direct:<userId>:<userId>` self-conversation; only a missing
recipient selects the customer-support channel.

## Group Chats

Group chats unify multi-user chat with LiveKit calls: each group is a
persisted `chat_groups` document (canonical `identity`, `status`/`origin`,
org `lineage`, plus a `participants` user-id list) and owns the derived
`call:group:<groupId>` room minted by the
[livekit feature](../livekit/README.md).

- `POST /api/support/groups` creates one (`{ name, participantIds }`);
  participants are user-scope — any existing account may join, unknown ids
  are rejected rather than silently dropped, and the creator is always
  included. The group itself stays homed in the creator's organization
  lineage. Creation pings every participant's inbox topic. Membership
  edits on an existing group go through the service seams
  (`addGroupParticipant`/`removeGroupParticipant`, creator-or-admin gated,
  the creator irremovable; the human seams refuse bot targets outright,
  so the participants entry and the AI's subscription cannot diverge
  through member management) — and assistant membership through the
  participant-gated twins (`addBotGroupParticipant`/
  `removeBotGroupParticipant`: any participant holding the agent-chat
  capability may seat or remove the AI, and the assistant is the only
  valid target) — driven by the
  [agent bots](../agent-bots/README.md) subscription endpoint when the
  AI joins or leaves a group chat.
- `DELETE /api/support/groups/:id` removes one; the creating member or an
  admin may delete. The route also drops the room's AI subscription rows
  (`onGroupDeleted` in [agent bots](../agent-bots/README.md)) so deleted
  rooms — AI chat threads included — never fire wakes.
- Group conversations appear in the user's inbox through
  `GET /api/support/conversations`, including groups without messages yet;
  summaries carry `groupName`, `groupId`, and `groupCreatorId`, and
  message/read/typing events ride `conversation:group:<id>` with the same
  participant admission as direct threads.
- Messaging a group passes `conversationKey: "group:<id>"` to
  `GET/POST /api/support/messages` instead of `recipientUserId`.

Conversation read state is stored in `supportConversationReads` as
`{ conversationKey, userId, lastReadAt, updatedAt }`. Conversation lists compute
unread counts from messages sent after `lastReadAt` by another sender.
The Chats inbox starts a direct thread explicitly through its user picker,
rather than pre-creating empty conversations for every reachable organization
user.
Conversation summaries include the last message's `instanceRefs` so the inbox can
render instance chips in message previews.
Each row carries its own `unreadCount` (rendered as the per-row badge in
the inbox's pin slot); the app-shell badge keeps the organization-wide
total across conversations.

## Inline Instance References

Chat messages can carry structured `instanceRefs`:

```json
[{ "type": "project", "id": "..." }]
```

`MessageAttachments.vue` renders everything attached to a message as one
stacked family under the message body on the page surface. Instance refs
resolve preview media over their snapshot (a served plugin preview
binding, a renderable stored payload, or a declared geometry value — the
channels the shared preview mounts); a ref with media renders
`InstanceInlineRef`'s stacked compact card (flush preview band over a
one-line label strip: identity truncating beside the small state tag).
Preview cards and image tiles flow as one masonry of independent column
stacks in send order (two columns, three past four; the fill starts at
the sender-side bottom corner — the thread's dock decision selects the
leading column, chunks are column-major with each chunk's first item at
its base, so the stacks rest on the gallery's bottom edge and connect
to a following text message; a lone media item full-width). Preview-less
refs render the outlined chip (type glyph), file documents the filled
chip — chips inline-wrap to lines at the sender edge. Images and video
embed inline (gallery tiles, players), other files open the shared preview
dialog on click (download for opaque kinds). A ref with a stored file
payload opens the same viewer for its file — download for opaque kinds
(SPEC §Chat files); every other ref opens the shared record popup
(`EntityPopup`, the record's compiled detail screen). Inline
`{{instance:type:id}}` tokens inside authored text strip from display.
The chat composer stores selected
instances only in `instanceRefs`; it does not inject attachment tokens into the
message body.
Ref labels carry the stored name slot only, empty when unnamed; surfaces
resolve the record title client-side (`instanceRecordTitle` over the
snapshot, the identifier row) and fall back to the localized type label
for empty names (the naming law under
[Instance-Linked Chats](#instance-linked-chats)).

Instance ref types come from readable generated screen sources in the current
`auth.screens` process manifest. `GET /api/support/instance-types` is therefore a
generated-scope endpoint, not a hardcoded chat allowlist, and includes any
non-`single` source whose requirement is satisfied at read level or stronger.

Ref validation at persistence follows the rights, not the byline: a send is
attributed to one principal but may carry another's validation rights via
`sendUserMessage`'s `refsAuth` option — an agent run posts its reply as the
assistant while its attached refs validate under the delegating user's auth
(the same rights the user would attach with). Without it, the assistant —
which holds no process roles — would silently drop every delegated
attachment at persistence. Refs the validating principal cannot read are
dropped silently.
The support service resolves the sender through the active process runtime
before deriving those sources, so ref validation uses the same
generated auth window as the rest of the app instead of the raw session auth.
Composer UIs should localize those returned type ids on the client instead of
showing raw backend values such as `cassette` or `sheet_design`.
`GET /api/support/instance-options` is the server-side ref resolution channel:
message-write validation, draft hydration, create-prompt field options, and
conversation-context resolution all read instance options through one
per-type loader seam:
framework/pack types use their feature list services (artifact, cassette,
sheet_design, user), and every other type — org-authored CTS types —
resolves its scoped list through the registry-resolved per-class instance
service (`processList`, CTS SPEC §13; see
[instances](../instances/README.md)), so no type needs a hand-registered
loader to be pickable or linkable in chats. Option loads use those generated source
filters when they are concrete. Because the current endpoint is keyed by
`type` rather than `sourceId`, each attachment type uses the first readable
generated source exposed by `instance-types`; support does not union multiple
generated sources of the same instance type behind one picker row. For
detail-child list sources that still depend
on `$screen.instanceId` /
`$screen.scope.instanceId`, the support service expands the child query across the
sender's readable parent instances for that screen instead of falling back to an
unbounded organization-wide list. Generated detail `single` sources are not
used as attachment-option loaders, so a detail route cannot widen a picker past
the process list windows that actually expose that instance type.
The chat attachment picker tree itself does not browse this endpoint: it
loads the same compiled home-screen list sources the home sidebar renders
(see [ChatAttachmentPicker](../../../components/shared/README.md)).

For direct chats, the instance-options endpoint also evaluates the recipient's
resolved process auth and marks options that the recipient cannot read through
their own access contract. The composer renders those as chat-only warnings.
When such a ref is sent, the stored `instanceRefs[]` entry keeps a compact instance
snapshot plus `chatOnlyForRecipient=true`, so the recipient can still inspect
that instance inside chat without gaining generated-screen access.
Snapshots are contract-driven (SPEC §4 `snapshot` facet): a type that
declares snapshot paths keeps exactly those, resolved through the
registry view — pack and org declarations alike, no per-type branches in
the framework. The cassette declaration carries the thumbnail-critical
geometry paths because direct-chat inline cards render from the stored
snapshot instead of refetching protected endpoints; types without the
facet get the generic compact strip (heavy geometry layers never ride
previews).
Message writes drop unsupported or unreadable refs instead of accepting
arbitrary ids. Messages may contain
only attachments; an empty body is valid as long as at least one instance ref
survives write-time validation. Agent bots attach through the same seam:
the chat tool `attach_instances` validates refs with `normalizeInstanceRefs`
against the bot's auth, and the reply send re-validates identically to a
composer send.

### Artifact Refs

`artifact` is a registered option-loader type backed by the artifacts feature
list service, so artifacts validate like any other ref. In an active org
process, a readable artifact list source whitelists the type as usual; when no
such source exists, the type is still whitelisted when the sender's compiled
action manifest contains an artifact creation action (`createEntity` with an
`upload`/`capture`/`editor` attachment-kind creator — the same detection the
generated screens use). Detection reads the compiler's canonical expanded
attachment-kind arrays and scores no creator credit for unexpanded shapes
rather than throwing, so a malformed manifest cannot take down instance-types,
instance-options, or message sends. This is what lets the chat attachment picker
offer "create artifact" and reference the freshly created artifact, without
widening artifact reads past the process windows: option loading still goes
through the scoped artifacts list service.

## Instance-Linked Chats

Messages may be linked to one instance (`instance: { type, id }` on send). The
server resolves the instance through the auth-scoped registry read
(`processGetById`), persists `instanceLink {type,id,name}`, and walks the
lineage bindings upward to persist `instancePath [{type,id,name}]` with the
organization root first, every ancestor, then the linked instance. Instance
messages also carry `organizationId`, which scopes the inbox query and the
organization-topic fanout. Chats over instances are composed views, not
separate threads:

- Narrow view: `GET /api/support/messages?instance=<type>:<id>&includeChildren=0`
  matches the instance's own conversation key.
- Composed view (default): `includeChildren=1` matches any message whose
  `instancePath` contains the instance, so a top-level chat lists the top instance
  plus every descendant message.

Authorization resolves the instance through the process-scoped registry read,
falling back to every generated source of the type and, finally, to the
exists-but-denied registry answer (403 vs 404): instances the org process
owns but whose grants deny reads still admit chats with a bare link and an
organization-only path. Truly unknown instances yield `403`. Realtime
fanout publishes the message event to every `conversation:instance:*` topic
along the instance path (aggregated views stay live through one subscription)
plus one `org:<id>` inbox ping. The user inbox query includes
`{ conversationKind: 'instance', organizationId }` so org-mates see each
other's instance messages. Inbox instance chats ship one row per messaged
instance (the organization chat included), each carrying the conversation
key of its nearest row-bearing ancestor as `parentKey`; the inbox client
groups rows into per-organization folder chips through that ancestry (the
inbox presentation contract lives in
[components](../../../components/README.md)). Row labels resolve live
from the instance record; stored link names
survive only when not stale id-fallbacks, and empty names localize the
type label client-side. Unread counts land on a row and on every ancestor
row (roots aggregate their subtree, like the composed thread views); shell
unread totals count root rows only.
Instance labels are identity names only (`identity.name`/`serial`): never
uids, raw ids, or type ids — surfaces fall back to the localized type
label when a name is empty. Rollup nodes are the top-level
nodes of the lineage hierarchy trees: each message joins at the ancestor
whose type carries no non-organization parent binding. The walk uses live
lineage (instance lineage keys plus the compiled bindings through the registry
read), never the stored instancePath, which can be degraded when ancestors
failed to resolve at send time.
Names denormalize into the path so quotes and inbox rows never join.

### Replies

A send may carry `parentMessageId`. The parent must share the conversation
key or, for instance messages, the same organization (an aggregated view can
reply to a message linked to a child instance); the composer links the reply
to the same instance the quoted message belongs to. The reply persists a
denormalized `parent { _id, senderUserId, senderName, snippet, attachments?,
instanceRefs?, timestamp }` quote (text clipped to 140 characters; voice
messages carry their attachment descriptor), so rendering and inbox
previews never need the parent loaded. Quotes of text messages show the
snippet; quotes of media or ref messages render the attachment/ref
summary line through `MessageAttachments` single-line (the same summary
the inbox preview uses), and the composer draft resolves the quoted
sender through the shared user chip.

## Message Attachments

A message may carry `attachments` — an ordered list of file descriptors
(capped at ten per message):

```json
[{ "kind": "image", "fileId": "<gridfs id>", "mimeType": "image/png", "name": "facade.png", "size": 120034 }]
```

Every descriptor carries `kind`, `fileId`, and `mimeType`; uploaded files
add `name`/`size`, voice messages add `durationSeconds` (clamped to ten
minutes). Kinds derive from the file's MIME family: `image`, `video`,
`audio`, `file`. Blobs upload through the [files feature](../files/) into
the `files` GridFS bucket (the SPEC §3 Blob home — the same bucket instance
payloads live in, so a descriptor's file is directly usable as a payload
reference); the optional `bucket` key marks pre-migration blobs left in
`uploads`. Previews, playback, and downloads stream through the shared
`/api/files/download/:id` route (`?download=1` for an explicit download;
single byte ranges answer `206` so video playback and seeking work); big
files upload through resumable chunk sessions with per-chunk progress
(see [api routes](../../api/README.md) → files, driven by the
`useChatFileUpload` client transport). Message documents never embed
media bytes. Call recordings imported by the
[livekit feature](../livekit/README.md#recordings) remain server-authored
`video` attachment-only messages posted from the recording starter; every
other attachment is user-uploaded through the composer (voice messages
included — recorded through `MediaRecorder`, sent as `audio` descriptors;
images may also be pasted from the clipboard, dragged onto the thread's
drop area, or captured with the device camera beside upload — all staging
through the same path as picked files, caps and instance-chat gating
included).
Attachment-only messages are valid (empty body). Reply quotes persist the
parent's attachments, and conversation summaries carry the last message's
`attachments` and `instanceRefs` so inbox previews render one attachment
summary (files first, then refs).

### Instance chats materialize files as child instances

A message linked to an instance and carrying user-uploaded attachments
materializes each file as an instance of the linked instance's type's
declared child that accepts it: a `file`-class child type whose payload
traits accept the attachment's MIME type and size and whose creation
protocols include `upload` (the same acceptance rule the generic construct
boundary enforces — `payloadAccepts` in
[packages/cts](../../../packages/cts/README.md)). The send creates the
child through the registry-resolved per-class service's `upload`
construction handler with the attachment as payload and the chat's
composer-target instance stamped on the child edge's lineage key, then
appends the created instance (with its compact snapshot) to the message's
`instanceRefs`, so the bubble shows the file as an inspectable entity while
the message itself stays linked to the composer target — galleries, replies,
and composed instance views keep working unchanged. When several children
accept the same file the client sends the sender's chosen `targetTypeId`
per attachment; the server validates the choice against its own candidate
set and rejects an ambiguous send without one. A composer target whose type
declares no accepting child refuses the upload: the composer's file input
accepts only the union of candidate `accept` lists (the early check), and a
write that smuggles an unmatched file is rejected with 400. Person
conversations (support, direct, group) and chats over party-class targets
(the organization chat — party classes cannot declare lineage children)
never materialize: files there stay plain unlinked attachments.

### Transcription

`POST /api/support/messages/:id/transcribe` converts a voice message into
text through the [transcription
feature](../transcription/README.md) **for the calling user only**: the
transcript persists per user in the `supportTranscripts` collection (one
document per message and viewer) and never touches the shared message
document. Reads merge the caller's transcripts onto every message page
(`transcript` on the DTO, viewer-scoped), so reply quotes, inbox previews,
and other viewers' bubbles — which read the authored body — never carry it.
Admission reuses the conversation context resolution (the same check that
authorizes SSE topics), and only single-attachment `audio` messages
qualify (call-recording `video` attachments are multi-speaker and
excluded): no attachments, an existing transcript for this viewer, or a
non-empty message body are rejected with 400/409. On success the endpoint
returns the updated DTO with `transcript` set; because the change is
private, no conversation event is published. The provider is resolved per
organization (`message.organizationId`, falling back to the caller's), so
org transcription settings decide between the local and cloud endpoints.

Legacy public transcripts (the retired contract that wrote the transcript
into the message body with a `transcription` marker on the descriptor) are
migrated per participant by
`server/scripts/migrate-support-transcripts.js`.

### Forwarding

`POST /api/support/messages/:id/forward` (`{ conversationKey }`) re-sends a
message into another conversation: the forwarder sends a fresh message
carrying the source's text and attachment descriptors (same GridFS files,
`targetTypeId` choices re-validated against the target's accepting children
on instance chats — an ambiguous match without a choice is rejected like
any send). Instance refs stay behind: they describe the source
conversation's context, not the target's. The source must be readable by
the caller (conversation context resolution) and the target must admit the
caller as a send target; the new message denormalizes `forwardedFrom
{ senderUserId, senderName, sentAt }` so a forwarded-from header line —
rendered above the message content on every shape, text, media, or
files — names the original sender without joins.

## Server-side message observers

`registerMessageObserver(fn)` is the in-process seam for server consumers
of persisted messages: observers receive `(context, message)` after the
write has fanned out through the connections layer, run outside the send
path (failures are logged, never propagated to the sender), and may return
promises the seam tracks. The [agent bots](../agent-bots/README.md)
runtime registers the chat-bot trigger this way — the support feature
stays bot-agnostic.

## The AI member in chats

The organization's assistant (the user carrying the `data.bot` marker —
see [agent bots](../agent-bots/README.md)) is the AI's attribution
identity: direct threads with it are ordinary direct conversations (it
floats first in the new-chat picker, capability-gated), group membership
rides the participants list, and instance (organization) chats admit it
through org-scoped reads. AI replies re-enter `sendUserMessage` with the
assistant's auth context but execute with the triggering user's access
(delegation, SPEC: agent access); there is no separate bot delivery
channel.

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
| `POST /api/support/typing` | Ephemeral typing signal; authorized like a read, published to the conversation topic, never persisted. |
| `GET /api/support/messages` | REST snapshot of the current user's support conversation; changes arrive over the connections stream. Message pages carry the caller's private transcripts (`transcript`, viewer-scoped). |
| `GET /api/support/messages?recipientUserId=<id>` | REST snapshot of a direct user conversation. |
| `GET /api/support/messages?conversationKey=group:<id>` | REST snapshot of a group conversation. |
| `GET /api/support/messages?limit=<n>&before=<iso>` | Lazy history page: the `n` newest messages older than the cursor, ascending, plus `hasMore`. |
| `GET /api/support/messages?instance=<type>:<id>&includeChildren=<0|1>` | Instance thread view: composed subtree (default) or the instance's own messages. |
| `POST /api/support/messages` | Send support, direct (`recipientUserId`), group (`conversationKey`), or instance (`instance {type,id}`) message; optional `parentMessageId` reply quote. Publishes `message`/`read`/inbox events through the connections layer. |
| `POST /api/support/messages/:id/transcribe` | Transcribes an authorized voice message into the caller's private transcript (per-user storage; the shared body never changes). |
| `POST /api/support/messages/:id/forward` | Forwards an authorized message's text and attachments into another conversation as a fresh send carrying `forwardedFrom` provenance. |
| `GET /api/support/admin/:user_id` | REST snapshot of the admin support conversation. |
| `POST /api/support/admin/:user_id` | Admin reply to a customer support conversation. |
| `GET /api/support/admin/chatlist` | Admin support-thread list snapshot; excludes direct user conversations. Refreshes via the `admin-support` connections topic. |

Concrete chat option loaders are registered for current domain list services
such as cassettes, sheet designs, and users. Types without a concrete loader can
still appear in `instance-types` when generated scope grants read access, but
their option list is empty until a scoped feature list service exists.

## Related

- [API routes](../../api/README.md)
- [Users](../users/README.md)
- [Shared components](../../../components/shared/README.md)
