# COMPONENT: Directory

Cross-tenant discovery over users and organizations: name matching and
minimal directory card reads for the contextual search surfaces. This is the only surface that intentionally
answers "who exists on the platform" for callers outside the caller's own
organizations; every user/organization list service stays membership-scoped
(see [users](../users/README.md) and
[organizations](../organizations/README.md)).

## Capability Module

`directory` is a capability module (no model/repository of its own): the
service orchestrates the users and organizations feature services and owns
the directory card projection. It never touches another feature's
collection.

## Privacy Contract

- User search matches **display name only** (`identity.name`,
  case-insensitive substring). Email is never matched and never leaves the
  users feature through directory responses.
- Directory cards carry only: `_id`, `identity.name`, and for users the
  versioned `data.avatarUrl` (avatars are already shared profile chrome),
  for organizations `data.type`.
- Every response adds a `directory` flag block computed for the caller:
  users get `{ isSelf, sharesOrganization }`; organizations get
  `{ isMember }`. These flags exist so directory surfaces can offer
  follow-up actions (chat, invite, partner) without widening field access.
- Rich fields still come from the grant-redacted feature detail routes
  (`GET /api/users/:id`, `GET /api/organizations/:id`), which return an
  empty object when the caller holds no grant. Directory cards are the
  fallback view, not a second redaction path: the card projection is
  defined here and nowhere else.

## Service API

- `search(auth, { q, types })` — authenticated callers only. Query is
  normalized (trimmed, lowercased); queries shorter than 2 characters
  return empty groups. `types` defaults to `['user', 'organization']`.
  Results are capped at 10 per type and caller-relative ranked
  deterministically: the caller's own organizations and users they share
  an organization with are resolved from their memberships and always
  lead the list ahead of name-matched strangers (the ranking happens
  before the cap, so same-named strangers cannot crowd the caller's own
  entries out). Delegates to
  `usersService.directorySearch(q)` / `organizationsService.directorySearch(q)`
  and projects matching entities into directory cards.
- `getEntry(auth, type, id)` — single directory card plus flags for one
  user or organization; 404 when the record does not exist. Returns the
  same card shape as search so pages render one contract.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/directory/search?q=<query>&types=user,organization` | Grouped directory cards for the contextual search surfaces. |
| `GET /api/directory/:type/:id` | One directory card (`type` is `user` or `organization`). |

## Client Surfaces

- Directory search lives in its contextual homes, not a shell-level
  surface: the chats new-chat picker (beside the organization-scoped
  list — every match is listed and messageable, direct threads are open
  between any two accounts) and the
  team-management invite dialog for users; the
  `/organization/partners` page for organizations.
- User/organization detail renders as the in-home directory surface
  ([components/directory](../../../components/directory/README.md)): an
  entity-bound workspace-page pane tab on desktop, the bounded home dialog
  on mobile. Inline user/organization ref popovers keep the compact
  preview and open into those panes through the workspace-open seam.

## Related

- [users](../users/README.md) — owns the user collection and name matching
- [organizations](../organizations/README.md) — owns the organization collection and name matching
- [invitations](../invitations/README.md) — the invite-existing-user flow consumes directory discovery
- [partnerships](../partnerships/README.md) — the partner-request flow consumes directory discovery
- [API routes](../../api/README.md)
