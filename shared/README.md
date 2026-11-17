# COMPONENT: Shared Contracts

Cross-runtime JavaScript contracts used by both browser-facing Nuxt code and
server features.

Parent: [root README](../README.md).
Target law: [SPEC.md](./SPEC.md).

Modules in this directory are portable runtime contracts. They must not import
other repo files through Nuxt-only `~/` or `~~/` aliases because server scripts,
workers, and direct Node imports do not own that resolver. Use package imports
such as `#shared/access-control.js` when the imported contract may be bundled
by Nitro dev; sibling-only helpers may use `./file.js` only when they are not
imported through server modules that Nitro externalizes.

## Core Files
- `access-control.js`: Shared permission grant evaluator for feature levels,
  UI actions, entity lineage scopes, workflow-transition scopes, and optional
  logical grant rules. `resolveEffectivePermissions()` centralizes active
  process → organization membership → legacy user grant precedence for server
  checks and client-side field redaction. Process-effective grants are bound
  to the active organization; redaction of an entity in another tenant uses
  only that tenant's membership grant, or no grant. For multi-organization
  user records, the caller's shared membership (active organization first)
  selects the user-field projection; the user's primary lineage organization
  does not hide a membership shared with the caller.
  Primary-status facts use the canonical `getPrimaryState()` reader from
  [`@perigram/core`](../packages/core/README.md); access evaluation does not
  maintain a parallel status projection.
- `plugin-runtime.js`: Shared worker type, resource budgets, and the
  platform capability allowlist for managed plugin execution.
- `plugin-surfaces.js`: The plugin-delivered editor surface contract versions
  the platform can mount (SPEC §20), plus the same-origin module URL resolver.
  Installed organization package assets are the primary source; explicit
  external integration origins remain a migration fallback.
- `permission-templates.js`: Access presets that expand into copied membership
  permission grants when a preset is assigned. Runtime checks consume the
  decomposed grants and do not branch on verbal preset labels.
- `instance-field-access.js`: Field-level display/redaction helpers shared by
  Nuxt cards and server API serialization. It consumes the shared
  field-access policy table
  ([`field-access-policies.js`](./field-access-policies.js)) plus the same
  grant evaluator used by UI actions and backend
  access checks. `canDisplayEntityField`/`filterEntityFields` also narrow
  display by the current state's field policy when the auth context carries
  `stateFieldPolicies` (the auth store derives it from the compiled producer
  workflows; CTS SPEC §7 `fieldPolicy`, §10).
- `ui-permissions.js`: UI resolver backed by the same grant
  evaluator as the server access engine (`resolveUiPermission`, consumed by
  the auth store).
- `role-access-summary.js`: Annotated derived role access summary for process
  role review surfaces (Team page role dialog, process designer role tab). It
  derives the effective profile, screen, action, and workflow-transition access
  lines for a set of organization role ids from process definition data and
  annotates every line with the contributing record: an authored role/profile/
  action/transition grant, a screen requirement consuming separate capability,
  a status-window rule, or a level fallback.
- `assignment-access-preview.js`: Assignment review over the existing process
  assignment compiler, shared evaluator, and compiled field policies. Concrete
  entity/status/lineage context yields allow/deny results; missing conditional
  context stays unresolved, including for screens whose separately authored
  capability is conditional. Active owner membership adds only the separately
  attributed recovery overlay.
- `ui-mapping/`: Design-system mapping contract for CTS declarations and
  compiled process contracts — one matcher table plus one resolver mapping
  field descriptors, class presets, preview modes, and compiled actions to
  component keys, spans, variants, chrome tokens, budgets, and button
  presentations. Pure data and functions; the canonical contract lives in
  [ui-mapping/README.md](./ui-mapping/README.md), the arrangement target
  state in [ui-mapping/SPEC.md](./ui-mapping/SPEC.md).
- `instance-filters/`: Canonical instance-filter tree — the one filter
  vocabulary the generic list transport, the generated-screen composition,
  and the collection toolbar speak; the flat transport map compiled screen
  sources emit is its projection. Pure data and functions; the canonical
  contract lives in
  [instance-filters/README.md](./instance-filters/README.md).
- `page-document.js`: The Page block document contract — `blocksFromMarkdown`
  splits legacy markdown into ordered text/collection blocks,
  `normalizePageDocument` preserves ordered text, collection, typed-reference,
  pinned saved-query definition, and immutable file-artifact blocks
  (including file revision history),
  `normalizePageFilePath` rejects unsafe relative paths, and `createBlockId`
  mints block ids. Consumed by the pages feature, its
  store, and the page document session.
- `markdown.js`: The markdown document contract — `renderMarkdown`
  (source to sanitized HTML, empty server-side) shared by the source
  editor and the read viewer, plus `MARKDOWN_ELEMENT_CLASSES`
  (`ck-markdown-body`, the named recipe in
  [assets/css/main.css](../assets/css/main.css) carrying the markdown
  editor's reading typography; every HTML host of pipeline output wears
  it — agent chat answers and file payload previews read like the
  editor) and `MARKDOWN_COMPACT_CLASS` (the card-band modifier:
  bounded card media — tiles, thumbs, peeks — read the same HTML at
  compact scale). The `text` preview mode is markdown prose: its
  payload renders through this pipeline like the text editor and agent
  answers. Mermaid fences render as diagrams; view fences carry a
  saved-view ref — `parseViewRef` reads it, `splitViewEmbeds` splits a
  document into markdown segments and embed blocks for the page
  surface's read composition, `removeViewEmbeds` strips matching fences
  during page migration, and the pipeline itself renders the ref
  as the quiet `ck-view-embed` chip where no live host exists (the live
  region mounts on page surfaces and the live editor,
  [components/generated](../components/generated/README.md)).
  Parsed as GFM with
  line breaks: a single newline is a hard
  break, the way GitHub-flavored documents and model answers read.
  Mermaid fences render as inline pele SVG diagrams; a fence that
  fails to parse stays a plain code block.
  Import-safe in Node; the render dependencies only run behind the
  window guard.
- `call-rooms.js`: The call-room name grammar and room↔conversation
  mapping shared by the
  [livekit feature](../server/features/livekit/README.md) and the call
  surfaces: `call:direct:<sorted user ids>`, `call:group:<groupId>`,
  `call:org:<orgId>`.
- `icon-fonts.js`: GENERATED by `scripts/build-icon-fonts.js` (see
  [scripts/README.md](../scripts/README.md)) — the authoring palette of
  every glyph class string the app's icon-font families offer, rewritten
  beside the CSS contract on every icon build and guarded in sync by
  `icon-fonts.spec.js`.
- `primeicons.js`: GENERATED by `scripts/build-icon-fonts.js` — every
  PrimeIcons class string the installed package ships, the searchable
  half of the declaration glyph picker.
- `*.spec.js`: Contract tests for shared framework and permission behavior.

Import-alias rules are defined in [scripts/README.md](../scripts/README.md).

## Permission Model
Access uses feature keys such as `projects`, `queues`, `cassettes`,
`nesting_runs`, `warehouses`, `catalogs`, `requisitions`,
`materials`, `layer_standards`, `users`, and `organizations` with levels
`none`, `read`, `write`, and `admin`.

System materials, layer standards, pens, and tools are not granted through
default presets. They are read from the public system catalogue marker
(`lineage.scope: "system"`, `lineage.public: true`, and
`data.visibility.public: true`) documented in the server architecture. User and
process grants still control mutable inventory/catalogue records and all
write/admin operations.

Permission values are level strings (`queues: 'write'`) or grant objects /
arrays:

```js
{
  queues: [{ level: 'write', scope: { projectId: 'project-a' } }],
  projects: [{ level: 'write', transitions: ['PRODUCED->MILLED'] }],
  requisitions: {
    level: 'admin',
    actions: { create: false, approve: true, reject: true, fulfill: true }
  }
}
```

Scopes are matched against entity lineage (`organizationId`, `projectId`,
`queueId`, `warehouseId`) or the entity id. Transition scopes match
`from->to`, target state, or `{ from, to }`. Workbench test access uses the
same permission object shape, so fixture ownership and per-run access overrides
exercise production access code.

Entity relation access is explicit rather than inherited. A `projects:admin`
grant does not automatically imply `queues:admin` for child queues; the process
compiler or caller must emit a separate `queues` grant, optionally scoped with
`scope.projectId` so it applies only to queues under the intended project
branch.

Lineage ID facts such as `lineage.projectId` read directly from the checked
entity. Lineage entity traits use facts such as
`lineage.project.status.primary` and `lineage.project.type`; they require the
caller to supply resolved ancestors through `context.lineageEntities` (for
example `{ project }`) or embed them on the checked entity as
`entity.lineageEntities`. Without that context, only the stored lineage IDs are
enforceable.

Grant objects may also include `rule`, an additive logical filter evaluated
after level/action/scope/transition checks:

```js
{
  projects: {
    level: 'write',
    rule: {
      all: [
        { fact: 'lineage.projectId', equals: 'project-a' },
        { fact: 'status.primary', equals: 'ACTIVE' },
        { not: { fact: 'action', equals: 'delete' } }
      ]
    }
  }
}
```

Rules support `all`, `any`, and `not` gates plus predicates over feature,
level, action, entity type/id, entity lineage IDs, resolved lineage entity
traits, primary status, transition fields, arbitrary entity fields, and
explicit context facts. Supported comparators are `exists`, `equals`,
`notEquals`, `in`, `includes`, and `atLeast` for access levels.

Workflow definitions declare feature permission requirements, lifecycle
capabilities, and hooks for access policy; app preset names serve as preset
labels at assignment time only. Presets expand into copied membership
permission grants when assigned, and persisted user records carry those
copied grants — grant checks read the stored grants. Workbench `testAccess`
grants use the same explicit permission shape.

Entity field display is stricter than entity read access. Entity read access
decides whether the record may be fetched; `instance-field-access.js` decides
which DTO paths may be shown. A path must be declared in the shared
field-access policy table
([`field-access-policies.js`](./field-access-policies.js)) or registered from
the declaration projection (`registerDeclarationFieldAccess`,
[stores/README.md](../stores/README.md)), and the active membership or
process grant must satisfy the policy level. Active process field policies
can narrow the domain policy
per organization: `read` fields display with read grants, `write` fields with
write grants, and `private` fields with admin grants. Absent field policy
means no display and no API serialization for auth-bound DTOs.
Field policies may target subfields inside arrays, such as
`data.memberships.organizationId`; redaction preserves only those allowed keys
on each array item instead of copying the whole object.

## Related
- [users feature](../server/features/users/README.md) - Stores membership and
  copied permission data on user records.
