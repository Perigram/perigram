# COMPONENT: CTS Types

Organization-scoped storage for `@perigram/cts` type declarations —
strangler layer 0 of the designer rebuild (see
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §4, §11, §13).

## Responsibility

- `repository.js` persists org-authored declarations in `cts_types`
  (never system types — those compile from the domain packs at runtime).
- `service.js` builds one registry per organization view: strangler-converted
  system types first, the org's stored declarations overlaying (shadowing a
  system id is refused). `defineType` validates the declaration through the
  real CTS registry, refuses breaking redefinitions (diff per SPEC §11,
  version bump on compatible change), and compiles the whole org view
  BEFORE persisting — the write gate refuses exactly the compile errors
  the candidate introduces (its own obligations, cross-type references it
  breaks); a failing write never touches the stored declaration. Beside
  the zero-instance relief, redefinition is also free when the
  stored declaration could never compile (obligation violations,
  unresolvable children edges): an invalid stored contract is a repair
  target, not something the diff protects — no migration is required to
  move away from it. Pre-existing view errors from a historically stored
  invalid type block only their own repair: valid writes around it still
  land, which is what un-wedges an org.
  A breaking redefinition of a type with persisted instances passes the
  gate when the declaration carries `migrate` steps covering every
  breaking change (SPEC §11; the step language and coverage rules are the
  `@perigram/cts` diff contract — see
  [packages/cts](../../../packages/cts/README.md)). Covered steps execute
  at this boundary, right after the new declaration persists: idempotent,
  org-scoped instance rewrites through the executor owned by
  [instances](../instances/README.md) (fields and `states.main` per step,
  then the new `typeVersion` stamp), each migrated instance publishing the
  shared typed invalidation event. The applied summary persists on the
  stored declaration as `migrated`; the steps themselves never do — a
  persisted declaration is always step-free (`migrate` is stripped from
  every upsert and `$unset` from any earlier document), because steps are
  one-time by design and a stored step set would rot into the next edit's
  "declared migration step … matches no breaking change" refusal the
  moment a client round-trips the stored declaration. An uncovered
  breaking change (or a declared step matching nothing in the diff) is
  refused — the gate is a compiler, not a script to remember — and the
  refusal is authorable: the `400` carries `data.plan` beside
  `data.boundBy`, the serialization of the computed migration plan
  (`{ changes: [<breaking change records>], requiredSteps: [<gate error
  strings>] }` — change records are the diff's `{ severity, kind,
  field? | state? | edge?, from?, to? }` shapes). The process designer
  turns that payload into the declarative-step dialog (see
  [components/process-designer](../../../components/process-designer/README.md));
  re-posting the declaration with the offered `migrate` steps is the whole
  ceremony. This boundary serves org-authored
  declarations; system/pack type changes are deploy-time code edits whose
  instance migrations remain deploy concerns.
  `removeType` deletes org declarations only, as a ceremony: the removal
  diffs against reality first — living instances (the per-class
  collection probe) and non-archived process definitions that bind the
  type (`findTypeReferences` in
  [process-definitions](../process-definitions/README.md) scans nodes,
  screens, and draft declaration children edges). A non-empty blast
  radius refuses with `409` carrying `{ instances, boundBy }`; the
  caller's explicit `abandon: true` (route: `?abandon=true`, actor from
  the session) proceeds and records the abandonment — instance/binder
  counts, actor, timestamp — on the org contract-change event and in
  the response (SPEC §19 abandoned data, promoted to a gate).
- `describeOrganizationTypes` returns the compiled client bundle (types,
  states, operators, derived display policy, JSON Schemas) plus attachment-kind
  payload traits and the composed pack editor bindings (SPEC §21: each
  mounted pack's `{ type, surface, modes }` records, dependency-ordered by
  `server/packs/declarations.js`). The editor list is the served half of
  the type→surface contract; the app maps surface ids to components in
  [components/generated/file-surfaces](../../../components/generated/README.md).
  Editor bindings are file-type contracts: the pack composition seam
  (`composePackEditors`) refuses a binding whose type no mounted pack
  declares or whose class is not `file` (payload-bearing), naming the
  offending pack and type — a party/group/process type can never carry an
  editor surface (spec: `editor-bindings.spec.js`). Beside the editors the
  view serves the installed plugins' surface declarations (owner decision
  2026-10-11) as `{ id, url, surfaceContract, kind? }` records: each
  module URL is the app's same-origin plugin-module proxy path
  (`/api/plugins/:pluginId/module<module>` — the plugins feature streams
  it from the install's endpoint origin server-side; browsers can never
  reach the server-network endpoint), connection settings stay
  server-side, and no configured endpoint serves `url:
  null` (the client loader renders the connect-the-executor state instead
  of guessing). Installed preview bindings (M7) compose the same way as
  `previews: [{ type, surface, url, surfaceContract }]` — one per type,
  the bound surface must be the install's own preview-kind surface, and
  the client's preview slots mount them read-only (see
  [components/generated](../../../components/generated/README.md)).

## API

`GET /api/admin/cts/types` — merged org view (the designer types pane and
the process designer's registry read this): compiled types, diagnostics,
attachment kinds, pack editor bindings, and installed plugin surface
declarations. `POST /api/admin/cts/types` —
author/evolve a declaration. `DELETE /api/admin/cts/types/:id` — remove an
org type.

## Related

- [packages/cts](../../../packages/cts/README.md) — the type system itself.
- [pages/organization/README.md](../../../pages/organization/README.md) —
  the consuming designer surfaces.
