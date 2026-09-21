# COMPONENT: Support Chat

Support chat is a capability module backed by the `supportMessages`
collection. It is not a v24 entity module, but API routes still delegate message
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
| Entity chat | `entity:<typeId>:<entityId>` | The sender (org-scoped read) |

Legacy support messages without `conversationKey` remain readable through the
support-channel match for the same `userId`. New writes always persist
`conversationKey`, `conversationKind`, `participants`, `senderUserId`,
`message`, `entityRefs`, `timestamp`, and optionally `attachment` (see
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

Direct user conversations are allowed only when the authenticated user is an
admin or shares an organization membership with the target user. Admin support
routes remain scoped to support conversations and do not list direct user
threads.
An explicit recipient equal to the authenticated user creates the deterministic
`direct:<userId>:<userId>` self-conversation; only a missing recipient selects
the legacy customer-support channel.

## Group Chats

Group chats unify multi-user chat with LiveKit calls: each group is a
persisted `chat_groups` document (canonical `identity`, `status`/`origin`,
org `lineage`, plus a `participants` user-id list) and owns the derived
`call:group:<groupId>` room minted by the
[livekit feature](../livekit/README.md).

- `POST /api/support/groups` creates one (`{ name, participantIds }`);
  participants must be organization-reachable users and the creator is
  always included. Creation pings every participant's inbox topic.
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
Conversation summaries include the last message's `entityRefs` so the inbox can
render entity chips in message previews.
The app-shell badge owns unread notification counts; individual drawer rows do
not show message/unread counts.

## Inline Entity References

Chat messages can carry structured `entityRefs`:

```json
[{ "type": "project", "id": "..." }]
```

`SupportMessageContent.vue` renders inline `{{entity:type:id}}` tokens as
`EntityInlineRef` chips for legacy/token-authored text and also renders
structured refs from `message.entityRefs[]`. The chat composer stores selected
entities only in `entityRefs`; it does not inject attachment tokens into the
message body.

Entity ref types come from readable generated screen sources in the current
`auth.screens` process manifest. `GET /api/support/type-ids` is therefore a
generated-scope endpoint, not a hardcoded chat allowlist, and includes any
non-`single` source whose requirement is satisfied at read level or stronger.
The support service resolves the sender through the active process runtime
before deriving those sources, so chat attachment pickers use the same
generated auth window as the rest of the app instead of the raw session auth.
Composer UIs should localize those returned type ids on the client instead of
showing raw backend values such as `cassette_design` or `nesting_run`.
Concrete picker options are resolved separately through
`GET /api/support/entity-options` using feature list services for entity types
that expose a scoped list API. Chat option lists use those generated source
filters when they are concrete. Because the current endpoint is keyed by
`type` rather than `sourceId`, each attachment type uses the first readable
generated source exposed by `type-ids`; support does not union multiple
generated sources of the same entity type behind one picker row. For
detail-child list sources that still depend
on `$screen.entityId` /
`$screen.scope.entityId`, the support service expands the child query across the
sender's readable parent entities for that screen instead of falling back to an
unbounded organization-wide list. Generated detail `single` sources are not
used as attachment-option loaders, so a detail route cannot widen a picker past
the process list windows that actually expose that entity type.

For direct chats, the entity-options endpoint also evaluates the recipient's
resolved process auth and marks options that the recipient cannot read through
their own access contract. The composer renders those as chat-only warnings.
When such a ref is sent, the stored `entityRefs[]` entry keeps a compact entity
snapshot plus `chatOnlyForRecipient=true`, so the recipient can still inspect
that entity inside chat without gaining generated-screen access.
Cassette snapshots must retain preview-driving fields such as `data.type` and
`data.definition`, because direct-chat inline cards render from the stored
snapshot instead of refetching protected cassette endpoints.
Message writes drop unsupported or unreadable refs instead of accepting
arbitrary ids. Incoming refs normalize common frontend/entity-surface aliases
such as `cassetteDesign`, `nestingRun`, and `materialPile` to their canonical
backend snake-case types before that validation step, so status-history drafts
and other UI-local relation refs do not disappear on send. Messages may contain
only attachments; an empty body is valid as long as at least one entity ref
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
rather than throwing, so a malformed manifest cannot take down type-ids,
entity-options, or message sends. This is what lets the chat attachment picker
offer "create artifact" and reference the freshly created artifact, without
widening artifact reads past the process windows: option loading still goes
through the scoped artifacts list service.

## Entity-Linked Chats

Messages may be linked to one entity (`entity: { type, id }` on send). The
server resolves the entity through the auth-scoped registry read
(`processGetById`), persists `entityLink {type,id,name}`, and walks the
lineage bindings upward to persist `entityPath [{type,id,name}]` with the
organization root first, every ancestor, then the linked entity. Entity
messages also carry `organizationId`, which scopes the inbox query and the
organization-topic fanout. Chats over entities are composed views, not
separate threads:

- Narrow view: `GET /api/support/messages?entity=<type>:<id>&includeChildren=0`
  matches the entity's own conversation key.
- Composed view (default): `includeChildren=1` matches any message whose
  `entityPath` contains the entity, so a top-level chat lists the top entity
  plus every descendant message.

Authorization resolves the entity through the process-scoped registry read,
falling back to every generated source of the type and, finally, to the
exists-but-denied registry answer (403 vs 404): entities the org process
owns but whose grants deny reads still admit chats with a bare link and an
organization-only path. Truly unknown entities yield `403`. Realtime
fanout publishes the message event to every `conversation:entity:*` topic
along the entity path (aggregated views stay live through one subscription)
plus one `org:<id>` inbox ping. The user inbox query includes
`{ conversationKind: 'entity', organizationId }` so org-mates see each
other's entity messages. Inbox entity chats ship in both groupings: top-level rows and per-entity
`isLeafRow` rows for the detailed view — the client switches between them,
and shell unread totals count top-level rows only. Rollup nodes are the top-level
nodes of the lineage hierarchy trees: each message joins at the ancestor
whose type carries no non-organization parent binding. The walk uses live
lineage (entity lineage keys plus the compiled bindings through the registry
read), never the stored entityPath, which can be degraded when ancestors
failed to resolve at send time.
Names denormalize into the path so quotes and inbox rows never join.

### Replies

A send may carry `parentMessageId`. The parent must share the conversation
key or, for entity messages, the same organization (an aggregated view can
reply to a message linked to a child entity); the composer links the reply
to the same entity the quoted message belongs to. The reply persists a
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
| `GET /api/support/type-ids` | Returns generated-screen entity source types readable by the current user. |
| `GET /api/support/entity-options?type=<type>&q=<query>&recipientUserId=<id>` | Returns readable entity options for chat attachment refs and flags recipient chat-only visibility for direct chats. |
| `POST /api/support/typing` | Ephemeral typing signal; authorized like a read, published to the conversation topic, never persisted. |
| `GET /api/support/messages` | REST snapshot of the current user's support conversation; changes arrive over the connections stream. |
| `GET /api/support/messages?recipientUserId=<id>` | REST snapshot of a direct user conversation. |
| `GET /api/support/messages?conversationKey=group:<id>` | REST snapshot of a group conversation. |
| `GET /api/support/messages?limit=<n>&before=<iso>` | Lazy history page: the `n` newest messages older than the cursor, ascending, plus `hasMore`. |
| `GET /api/support/messages?entity=<type>:<id>&includeChildren=<0|1>` | Entity thread view: composed subtree (default) or the entity's own messages. |
| `POST /api/support/messages` | Send support, direct (`recipientUserId`), group (`conversationKey`), or entity (`entity {type,id}`) message; optional `parentMessageId` reply quote. Publishes `message`/`read`/inbox events through the connections layer. |
| `GET /api/support/admin/:user_id` | REST snapshot of the admin support conversation. |
| `POST /api/support/admin/:user_id` | Admin reply to a customer support conversation. |
| `GET /api/support/admin/chatlist` | Admin support-thread list snapshot; excludes direct user conversations. Refreshes via the `admin-support` connections topic. |

Concrete chat option loaders are registered for current domain list services
such as projects, queues, cassettes, cassette designs, nesting runs, sheet
designs, libraries, warehouses, catalogs, material piles, remnants,
requisitions, sheets, materials, and users. Types without a concrete loader can
still appear in `type-ids` when generated scope grants read access, but
their option list is empty until a scoped feature list service exists.

## Related

- [API routes](../../api/README.md)
- [Users](../users/README.md)
- [Shared components](../../../components/shared/README.md)
