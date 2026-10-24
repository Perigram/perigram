# COMPONENT: Entity Cards

Registry-bound Vue cards for the design-system entity surfaces. Every card
in this family renders through the shared `InstanceCard` primitive —
[shared/README.md](../shared/README.md) owns the body/variant contract.
Parent: [components/README.md](../README.md).

## Registry

`utils/design-system-contract.js` is the vocabulary source:
`DESIGN_SYSTEM_ENTITY_CONTRACTS` (key, wire `typeId`, `labelKey`, field
groups, surfaces, factory) plus the field-group and surface tables.
`utils/design-system.js` binds each contract entry to its card component
and DTO factory (`DESIGN_SYSTEM_ENTITIES`). Cards resolve through this
registry: `InstanceInlineRef` keeps a local map over five keys
(`entityRevision`, `user`, `organization`, `artifact`, `artifactTemplate`),
and `DrawingCanvas` imports the pen/layer master-data cards directly.
`pages/test/ui-lab.vue` renders demo rows from the manifest;
`framework.manifest.json` snapshots the same contract for framework
consumers. `ENTITY_CONTRACT_BY_TYPE` keys entries by both wire `typeId`
and surface `key` — both are live vocabularies; the label seams resolve
`labelKey` through it.

Adding or renaming a card updates the contract, the binding, and the DTO
factory; the UI lab and the manifest follow from those. Field groups
define display semantics; field access stays the security boundary —
app-layer field groups and surface overrides need their DTO paths declared
in the field-access policy.

## Card law

- One `InstanceCard :variant="variant"` per card; the body passes once
  through the default slot and is reused by card variants and
  inline/compact popovers. Slots: `before-identity`, `subtitle`, body,
  footer — `#title` belongs to the standard identity/status row. Subtitle
  slots guard `v-if="variant !== 'card'"`; `compact-content` and
  `inline-extra` carry short, stable cues only.
- Facts resolve from the domain display field groups; a card declares no
  local `DataBlock` path arrays — extend a field group and keep the path
  inside the field-access policy (`shared/instance-field-access.js`
  filters every path; undeclared paths stay hidden).
- Card bodies speak the entity's contract as an operational summary —
  identity/status in the title, concise facts in the body, actions in the
  footer: production entities emphasize flow and generated outputs,
  material entities physical specs and stock, catalog entities options and
  visual samples, system entities ownership/contact/file context.
- Relation refs pass design-system surface keys (`cassette`,
  `sheetDesign`, `entityRevision`); `TraceLink` serves rows whose explicit
  purpose is route navigation.
- Geometry-capable cards render the visual source (`GeometryPreview` over
  the resolved preview source or points) — file-type tags and preview
  flags stay off the card.
- Interactive status belongs to entity types with real `cncWorkflows`
  definitions; cards for DTOs without workflows set `:show-status="false"`
  (or a read-only badge where the data model requires it) — lifecycle
  states are a workflow-machine concern.
- Lifecycle transitions render through `InstanceState` from the canonical
  workflow/status API; destructive, edit, reset, and feature command
  buttons stay in card footers or page action slots.
- Card click handlers ignore nested interactive targets through
  `utils/interactive-target.js` so embedded statuses, links, artifacts,
  geometry previews, and nested inline cards stay clickable.
- Hosts render cards directly with explicit props; the injected
  `entityContext` relation fallback serves development and workbench
  surfaces. Interaction a card lacks is implemented in the card or a
  shared primitive.

## Surfaces

| Key — card | Contract | Consumers |
|---|---|---|
| `entityRevision` — `EntityRevisionCard` | Read-only provenance card: revision scope, number, and short hash under `data`; the source entity relation renders through `InstanceInlineRef` (cassette source revisions render as `cassetteTemplate` refs — templates are stored in the `cassettes` collection); status actions hidden, revisions are immutable. | registry; `InstanceInlineRef` |
| `penTemplate` — `PenTemplateCard` | Master data: stroke settings in `data.stroke` drive a real color/weight/pattern line preview; status and trace hidden. | registry; `DrawingCanvas` (direct import) |
| `layerStandard` — `LayerStandardCard` | Master data: layer code, purpose, and default pen; status and trace hidden. Drawing surfaces reference layer standards through this card. | registry; `DrawingCanvas` (direct import) |
| `user` — `UserCard` | Identity/contact and permission-related facts; status and trace hidden — permission changes stay on the admin page endpoints. The inline variant serves status-history actor rows; the avatar stays compact there so audit rows stay dense. Record popup: the directory profile ([DirectoryDetailSurface](../directory/README.md)). | registry; `InstanceInlineRef`; directory popup |
| `organization` — `OrganizationCard` | Identity and contact/role facts; status and trace hidden. `context`/`actions` slots carry membership state and caller-owned navigation as visible footer actions. Profile renders one action per membership opening that organization's pane: the active organization's pane is its generated overview (billing, team, and process screens are children of that overview); an inactive organization's pane is the directory profile carrying the switch action. Record popup: the directory profile ([DirectoryDetailSurface](../directory/README.md)). | registry; `InstanceInlineRef`; directory popup |
| `artifact` — `ArtifactCard` | File records (DXF, SVG, PDF, nesting reports): expects `identity`, `lineage`, `attachments`, and `data.type`; status hidden — file lifecycle is a workflow concern. Queue ancestry rides the shared trace chrome through `lineage.queueId`; nesting-run context renders through `InstanceInlineRef`. The card may own a preview click action and disables `InstanceCard` expansion for it. Artifact records carry no compiled detail surface: the framework pack declares the type into every served view as machinery, and process authoring grants framework types no stations — the card preview and the artifact viewer registry cover inspection, file operations ride the artifact API surfaces. | registry; `InstanceInlineRef` |
| `artifactTemplate` — `ArtifactTemplateCard` | Inline-ref surface: identity/chrome delegated to `InstanceCard`, DTO-backed fields to `InstanceSurfaceContent`; footer actions come from the hosting surface. Revision provenance belongs to the [artifact-templates feature](../../server/features/artifact-templates/README.md). | registry; `InstanceInlineRef` |

## Validation

After changing card fields, factories, or manifest-backed components, run:

```bash
npx vitest run shared/design-system.spec.js
npx vitest run shared/localization.spec.js
npm run framework:write-manifest
npm run framework:manifest
```

## Related

- [Shared UI components](../shared/README.md) — `InstanceCard`, `InstanceInlineRef`, `DrawingCanvas`
- [Directory surfaces](../directory/README.md) — record popups for user/organization
- [Artifact viewers](../artifacts/README.md)
- [Visual tokens](../../assets/tokens/README.md)
- [DTO factories](../../test-data/README.md)
- [Facade plugin](../../workers/facade/README.md)
- Server contracts: [instance revisions](../../server/features/instance-revisions/README.md), [artifacts](../../server/features/artifacts/README.md), [artifact templates](../../server/features/artifact-templates/README.md), [organizations](../../server/features/organizations/README.md), [users](../../server/features/users/README.md), [instances](../../server/features/instances/README.md)
