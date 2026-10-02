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
  the workspace-open seam — never a route. Sections are PrimeVue-owned:
  `Panel` headers carry the section chrome (Details, My Organizations,
  Partners) and memberships render as an inline `Menu` (building icon,
  active organization marked by the success check).
- The organization profile carries the record's conversation affordance
  for members: the chat entry opens the organization's own instance
  thread through the shared `openInstanceChat` seam (the active
  organization's pane overview carries the same entry in its actions).
- The active organization's PANE renders its real page: the generated
  organization overview (identity header + management entries) from the
  hydrated manifest; the popup (`bounded`) keeps the directory profile —
  a full page inside a popup would stack two surfaces. Non-active
  organizations keep the directory facts — read-level rows (type, email,
  phone, created) with a directory-card fallback so non-member
  organizations are not blank; the fact rows are access-filtered per
  field.
- The surface is a flat hosted column — identity header, divider-
  separated sections, action row — never boxed panels: the dialog or
  pane is the surface (the settings-popup content pattern).
- The surface owns its action row because panes/dialogs have no page-level
  action chrome: user chat (the direct 1:1 thread — open to any non-self
  recipient) / invite (routes into team management with
  `?invite=`) / self profile; organization context switching (the pane
  itself is the organization view — management surfaces are reached
  through the home shell's organization entries, never route-away
  buttons) and the partnership lifecycle actions (see
  [partnerships](../../server/features/partnerships/README.md)).
- Management destinations (profile, organization overview, team
  management) are the sanctioned organization/system routes; entity detail
  never navigates to a route of its own.

## Related

- [generated components](../generated/README.md) — workspace pages and the home shell
- [shared components](../shared/README.md) — `InstanceInlineRef` and the chat seam
- [ChatSupport](../shared/README.md) — the new-chat picker's directory search
- [server/features/directory](../../server/features/directory/README.md)
