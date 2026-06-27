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

## Inline Entity References

Chat messages can carry structured `entityRefs`:

```json
[{ "type": "project", "id": "..." }]
```

The frontend inserts matching text tokens in the message body using
`{{entity:type:id}}`. `SupportMessageContent.vue` renders those tokens as
`EntityInlineRef` chips and also renders any structured refs that are not
present in the text. Entity refs must be selected from
`GET /api/support/entity-options`; message writes drop unsupported or unreadable
refs instead of accepting arbitrary ids.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/support/conversations` | SSE stream of the current user's support/direct conversation list with unread counts. |
| `POST /api/support/read` | Marks an authorized conversation read for the current user. |
| `GET /api/support/entity-options?type=<type>&q=<query>` | Returns readable entity options for chat attachment refs. |
| `GET /api/support/messages` | SSE stream for the current user's support conversation. |
| `GET /api/support/messages?recipientUserId=<id>` | SSE stream for a direct user conversation. |
| `POST /api/support/messages` | Send support or direct user message, depending on `recipientUserId`. |
| `GET /api/support/admin/:user_id` | Admin SSE stream for a customer support conversation. |
| `POST /api/support/admin/:user_id` | Admin reply to a customer support conversation. |
| `GET /api/support/admin/chatlist` | Admin support-thread list; excludes direct user conversations. |

Supported chat entity option types are `project`, `queue`, `sheet`, `material`,
and `user`.

## Related

- [API routes](../../api/README.md)
- [Users](../users/README.md)
- [Shared components](../../../components/shared/README.md)
