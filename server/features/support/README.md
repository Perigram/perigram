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
`message`, `instanceRefs`, `timestamp`, and optionally `attachment` (see
[Voice Messages](#voice-messages)).

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
  lineage. Creation pings every participant's inbox topic.
- `DELETE /api/support/groups/:id` removes one; the creating member or an
  admin may delete.
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
The app-shell badge owns unread notification counts; individual drawer rows do
not show message/unread counts.

## Inline Instance References

Chat messages can carry structured `instanceRefs`:

```json
[{ "type": "project", "id": "..." }]
```

`SupportMessageContent.vue` renders inline `{{instance:type:id}}` tokens as
`InstanceInlineRef` chips for token-authored text and also renders
structured refs from `message.instanceRefs[]`. The chat composer stores selected
instances only in `instanceRefs`; it does not inject attachment tokens into the
message body.

Instance ref types come from readable generated screen sources in the current
`auth.screens` process manifest. `GET /api/support/instance-types` is therefore a
generated-scope endpoint, not a hardcoded chat allowlist, and includes any
non-`single` source whose requirement is satisfied at read level or stronger.
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
survives write-time validation.

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
other's instance messages. Inbox instance chats ship in both groupings: top-level rows and per-instance
`isLeafRow` rows for the detailed view — the client switches between them,
and shell unread totals count top-level rows only. Rollup nodes are the top-level
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
denormalized `parent { _id, senderUserId, senderName, snippet, attachment?,
timestamp }` quote (text clipped to 140 characters; voice messages carry
their attachment descriptor), so rendering and inbox previews never need the
parent loaded.

## Voice Messages

A message may carry `attachment` — currently exactly one descriptor of kind
`audio`:

```json
{ "kind": "audio", "fileId": "<gridfs id>", "mimeType": "audio/webm", "durationSeconds": 12 }
```

The client records through `MediaRecorder`, uploads the blob through the
[files feature](../files/) upload endpoint, and posts the descriptor as the
message payload; the message body may stay empty. Playback streams the stored
file through the shared `/api/files/download/:id` route, so the message
document never embeds audio bytes. Unsupported kinds, missing file ids, and
durations above ten minutes are rejected (longer recordings clamp on write).
Conversation summaries carry the last message's `attachment` so inbox previews
can render a voice-message chip.

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
| `GET /api/support/messages` | REST snapshot of the current user's support conversation; changes arrive over the connections stream. |
| `GET /api/support/messages?recipientUserId=<id>` | REST snapshot of a direct user conversation. |
| `GET /api/support/messages?conversationKey=group:<id>` | REST snapshot of a group conversation. |
| `GET /api/support/messages?limit=<n>&before=<iso>` | Lazy history page: the `n` newest messages older than the cursor, ascending, plus `hasMore`. |
| `GET /api/support/messages?instance=<type>:<id>&includeChildren=<0|1>` | Instance thread view: composed subtree (default) or the instance's own messages. |
| `POST /api/support/messages` | Send support, direct (`recipientUserId`), group (`conversationKey`), or instance (`instance {type,id}`) message; optional `parentMessageId` reply quote. Publishes `message`/`read`/inbox events through the connections layer. |
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
