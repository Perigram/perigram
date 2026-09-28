# COMPONENT: Directory Surfaces

In-home presentation of user and organization detail. There are no
standalone directory routes: the surface renders as an entity-bound
workspace-page tab inside the generated home workspace (desktop panes) and
as the bounded dialog the home workspace opens on mobile viewports. Popups
remain the compact preview surface: inline refs
(`InstanceInlineRef` → `UserCard`/`OrganizationCard`) and the global-search
result popup ([shared](../shared/README.md)); their open action routes
into these panes through the shared workspace-open seam.

## Files

| File | Purpose |
|---|---|
| `DirectoryDetailSurface.vue` | User/organization detail body: identity header, grant-redacted facts, contextual actions. |

## Contract

- Props `{ typeId, instanceId }` (`user` or `organization`) plus `bounded`
  for dialog hosting (the pane host owns its own scrolling).
- Loads the directory card from `GET /api/directory/:type/:id` (privacy
  contract in [the directory feature](../../server/features/directory/README.md))
  and the grant-redacted DTO from the ordinary feature detail endpoint;
  richer facts render only when the DTO carries them.
- Membership rows render only organizations the viewer can themselves
  resolve (cross-tenant org names are not readable) and open them through
  the workspace-open seam — never a route.
- The surface owns its action row because panes/dialogs have no page-level
  action chrome: user chat (the direct 1:1 thread — open to any non-self
  recipient) / invite (routes into team management with
  `?invite=`) / self profile; organization overview entry, context switch,
  and the partnership lifecycle actions (see
  [partnerships](../../server/features/partnerships/README.md)).
- Management destinations (profile, organization overview, team
  management) are the sanctioned organization/system routes; entity detail
  never navigates to a route of its own.

## Related

- [generated components](../generated/README.md) — workspace pages and the home shell
- [shared components](../shared/README.md) — `InstanceInlineRef` and the chat seam
- [ChatSupport](../shared/README.md) — the new-chat picker's directory search
- [server/features/directory](../../server/features/directory/README.md)
