```yaml
doc_id: SERVER-FEATURES-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Server Features Plane

The framework feature plane: one module per capability, each a vertical
slice consumed through its service seam. API routes, the core runtimes
(via the app registry), and sibling features are the consumers. The plane
carries framework capabilities; domain implementations live under installed
plugins, and every type with a declaration is served — feature module or
generic instance machinery.

Parent: [server](../README.md) · SPEC: [core runtime](../core/SPEC.md) ·
consumed contracts: [instances](./instances/README.md) (generic instance
machinery), [runtime registry](../runtime/README.md),
[instance-events](./instance-events/README.md).

## Contracts owned here

### Plane law

- One module per framework capability, named for the capability, living at
  `server/features/<name>/`.
- The plane is framework-only: a removable domain (e.g. the facade
  fabrication domain) ships as its installed plugin; framework features
  import domain code from nowhere.
- Types divide by service path: types with a feature module are served by
  that module; every other declared type — pack types and org-authored
  types — is served entirely by the generic instance machinery
  ([instances](./instances/README.md)), executable from its declaration.
- The entity feature set derives from the CTS registry view; the
  architecture guard enforces the derivation. The capability set is
  single-sourced between the guard and this plane's README.

### Module anatomy

| File | Entity modules | Capability modules |
|---|---|---|
| `model.js` | class extending `BaseEntity`, canonical `toJSON()` | — (exempt) |
| `repository.js` | raw MongoDB access, `toFlexibleId()` ids | same |
| `service.js` | orchestration, access engine, serialized DTOs | same |
| `index.js` | exports the `service` namespace | same |
| `README.md` | component contract incl. route inventory | same |
| `process-update-handler.js` | `processUpdate` implementation when the module owns persisted entities | as needed |

`_template/` is the scaffold for entity modules: it carries the file
skeleton and pointers to this plane's structure rules.

### Module contract

- Consumption goes through `index.js`; repositories and models stay
  module-private.
- Service functions accept `(params, event)` or a structured auth context,
  authorize before data access, and return `toJSON()` output.
- Registration is explicit in `server/runtime/app-registry.js`; modules
  stay silent at import time.
- Cross-module work goes through service seams or registered effects;
  a feature reads another feature's collection through that feature's
  service.
- Mutations that other sessions should observe publish typed invalidation
  events through
  [instance-events](./instance-events/README.md).
- Lifecycle transitions run through the
  [state runtime](../core/machines/README.md); permission decisions
  through [access](../core/access/README.md).
- Blocks import from `~/server/core/blocks/index.js`.
- Prepaid service tokens are organization-owned
  ([billing](./billing/README.md) is canonical).
- REST surfaces live under `server/api/` named per feature; each module
  README owns its route table.

### The artifact family

`artifacts` (generated/uploaded files), `artifact-templates` (generation
layouts), and `artifact-conversions` (conversion operations) form one
family: the live file path behind chat attachments
([support](./support/SPEC.md)), the `generateAttachment` command, and
conversion runs. Root SPEC §UI fixes the retirement condition: the
`artifact` entity dies when chat/proof/capture/upload flows move to file
instances; the family retires together in that single cut, module + routes
+ specs.

### Definition lifecycle

Process definitions — authoring, activation, migration gates, action
execution — are a feature of this plane with their own SPEC:
[process-definitions](./process-definitions/SPEC.md).

## Structure

| Group | Modules |
|---|---|
| Entity modules | `artifact-templates`, `artifacts`, `instance-revisions`, `organizations`, `process-definitions`, `users` |
| Instance machinery | `instances`, `cts-types`, `instance-events`, `states`, `workflow-overrides` |
| Party and org | `directory`, `invitations`, `partnerships`, `sessions` |
| Communication | `agent-bots`, `connections`, `livekit`, `meetings`, `notifications`, `support`, `transcription`, `web-search` |
| Platform services | `artifact-conversions`, `billing`, `files`, `llm`, `plugins`, `system-settings` |
| Scaffold | `_template` |

## Laws

- The generic instance service resolution contract is canonical in
  [runtime](../runtime/README.md); this plane consumes it.
- Grant shapes and evaluation precedence are canonical in
  [core/access](../core/access/README.md).
- The block DTO and vocabulary are canonical in
  [packages/core](../../packages/core/README.md).
- Wire vocabulary is `typeId`/`id` end to end (root SPEC §Vocabulary).
- `typeId`/`id` also names route params and repository ids
  (`toFlexibleId()` percent-decoding at the route boundary).

## End state

Every module README owns exactly its route table, service seam, and data
contract, linking the plane-owned rules above; the guard's feature sets
and the README tables derive from one source; the artifact family is
either the live file path or retired by the recorded condition — the
plane carries zero domain code.
