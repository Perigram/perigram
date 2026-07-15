# COMPONENT: Support Chat

Support chat is a capability module backed by the `supportMessages`
collection. It is not a v24 entity module, but API routes still delegate message
normalization and conversation selection to `service.js`, while `repository.js`
owns raw MongoDB access.

## Conversation Contract

Messages have a deterministic `conversationKey`:

| Kind | Key | Participants |
|---|---|---|
| User to support | `support:<userId>` | The customer user id |
| User to user | `direct:<sorted-user-id-a>:<sorted-user-id-b>` | Both user ids, sorted |

Legacy support messages without `conversationKey` remain readable through the
support-channel match for the same `userId`. New writes always persist
`conversationKey`, `conversationKind`, `participants`, `senderUserId`,
`message`, `entityRefs`, and `timestamp`.

Direct user conversations are allowed only when the authenticated user is an
admin or shares an organization membership with the target user. Admin support
routes remain scoped to support conversations and do not list direct user
threads.

Conversation read state is stored in `supportConversationReads` as
`{ conversationKey, userId, lastReadAt, updatedAt }`. Conversation lists compute
unread counts from messages sent after `lastReadAt` by another sender.
The user-facing conversation list also merges reachable same-organization
users as empty direct conversations, so the Chats drawer can start a direct
thread before any message exists.
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
`auth.screens` process manifest. `GET /api/support/entity-types` is therefore a
generated-scope endpoint, not a hardcoded chat allowlist, and includes any
non-`single` source whose requirement is satisfied at read level or stronger.
The support service resolves the sender through the active process runtime
before deriving those sources, so chat attachment pickers use the same
generated auth window as the rest of the app instead of the raw session auth.
Composer UIs should localize those returned type ids on the client instead of
showing raw backend values such as `cassette_design` or `entity_revision`.
Concrete picker options are resolved separately through
`GET /api/support/entity-options` using feature list services for entity types
that expose a scoped list API. Chat option lists use those generated source
filters when they are concrete. Because the current endpoint is keyed by
`type` rather than `sourceId`, each attachment type uses the first readable
generated source exposed by `entity-types`; support does not union multiple
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
such as `cassetteDesign`, `entityRevision`, and `materialPile` to their canonical
backend snake-case types before that validation step, so status-history drafts
and other UI-local relation refs do not disappear on send. Messages may contain
only attachments; an empty body is valid as long as at least one entity ref
survives write-time validation.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/support/conversations` | Snapshot of the current user's support/direct conversation list with unread counts. |
| `POST /api/support/read` | Marks an authorized conversation read for the current user. |
| `GET /api/support/entity-types` | Returns generated-screen entity source types readable by the current user. |
| `GET /api/support/entity-options?type=<type>&q=<query>&recipientUserId=<id>` | Returns readable entity options for chat attachment refs and flags recipient chat-only visibility for direct chats. |
| `GET /api/support/messages` | SSE stream for the current user's support conversation. |
| `GET /api/support/messages?recipientUserId=<id>` | SSE stream for a direct user conversation. |
| `POST /api/support/messages` | Send support or direct user message, depending on `recipientUserId`. |
| `GET /api/support/admin/:user_id` | Admin SSE stream for a customer support conversation. |
| `POST /api/support/admin/:user_id` | Admin reply to a customer support conversation. |
| `GET /api/support/admin/chatlist` | Admin support-thread list; excludes direct user conversations. |

Concrete chat option loaders are registered for current domain list services
such as projects, queues, cassettes, cassette designs, entity revisions, sheet
designs, libraries, warehouses, catalogs, material piles, remnants,
requisitions, sheets, materials, and users. Types without a concrete loader can
still appear in `entity-types` when generated scope grants read access, but
their option list is empty until a scoped feature list service exists.

## Related

- [API routes](../../api/README.md)
- [Users](../users/README.md)
- [Shared components](../../../components/shared/README.md)
