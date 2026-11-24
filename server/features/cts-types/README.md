# COMPONENT: CTS Types

Organization-scoped storage for `@perigram/cts` type declarations —
strangler layer 0 of the designer rebuild (see
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §4, §11, §13).

Parent: [server/features](../README.md).

## Responsibility

- `repository.js` persists org-authored declarations in `cts_types`
  (never system types — those compile from the domain packs at runtime).
- An org type lives until `removeType` deletes it (cts SPEC §4).
  Process definitions reference type ids; their activation and deletion
  leave the registry untouched.
- The class library and
  [class dialog](../../../components/type-designer/README.md) write
  declarations directly through `defineType`; compilation is an
  access-time projection, so a persisted compatible change reaches
  screens and actions through the contract-change event. Class states
  (flat values with display policy) normalize at the same gate.

### Write gate

`service.js` builds one registry per organization view: strangler-converted
system types first, the org's stored declarations overlaying (shadowing a
system id is refused). `defineType` validates the declaration through the
real CTS registry, refuses breaking redefinitions (diff per SPEC §11,
version bump on compatible change), and compiles the whole org view
before persisting — the write gate refuses exactly the compile errors
the candidate introduces (its own obligations, cross-type references it
breaks); a failing write leaves the stored declaration untouched.
Beside the zero-instance relief, redefinition is free when the stored
declaration cannot compile (obligation violations, unresolvable children
edges): an invalid stored contract is a repair target. View errors from
an invalid stored type block only that type's repair — valid writes
around it still land, which is what un-wedges an org.

### Migration steps

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
stored declaration as `migrated`; the steps themselves are stripped on
every upsert, so a persisted declaration is always step-free (steps are
one-time). An uncovered breaking change, or a declared step matching
nothing in the diff, is refused — and the refusal is authorable: the
`400` carries `data.plan` beside `data.boundBy`, the serialization of the
computed migration plan (`{ changes: [<breaking change records>],
requiredSteps: [<gate error strings>] }` — change records are the diff's
`{ severity, kind, field? | state? | edge?, from?, to? }` shapes). The
process designer turns that payload into the declarative-step dialog (see
[components/process-designer](../../../components/process-designer/README.md));
re-posting the declaration with the offered `migrate` steps is the whole
ceremony. This boundary serves org-authored declarations; system/pack
type changes are deploy-time code edits whose instance migrations remain
deploy concerns.

### Removal ceremony

`removeType` deletes org declarations only, as a ceremony: the removal
diffs against reality first — living instances (the per-class collection
probe) and non-archived process definitions that bind the type
(`findTypeReferences` in
[process-definitions](../process-definitions/README.md) scans nodes,
screens, and draft declaration children edges). A non-empty blast
radius refuses with `409` carrying `{ instances, boundBy }`; the
caller's explicit `abandon: true` (route: `?abandon=true`, actor from
the session) proceeds and records the abandonment — instance/binder
counts, actor, timestamp — on the org contract-change event and in
the response (root SPEC §15 abandoned data, promoted to a gate).

### Organization data sequence

`defineType` and `removeType` capture the organization sequence before validation and reserve it with compare-and-swap for the declaration write. The reservation covers unique-index changes and the full instance migration; concurrent organization writes make the declaration request return `409`. Each successful declaration mutation advances the sequence once through [instances](../instances/README.md#organization-change-sequence). A graph read captures this sequence beside the compiled registry view, so declaration changes invalidate a read set alongside instance, relation, and collection changes.

### Client bundle

`describeOrganizationTypes` returns the compiled client bundle plus the
installed plugins' records:

| Record kind | Content |
|---|---|
| Compiled bundle | types, states, operators, derived display policy, JSON Schemas |
| Attachment-kind payload traits | per declared kind |
| Editor bindings | `{ type, surface, modes }` per plugin-declared type — the served half of the type→surface contract ([components/generated](../../../components/generated/README.md) maps surface ids to components) |
| Surface declarations | `{ id, url, surfaceContract, kind?, ownsChrome? }` per installed plugin module; `ownsChrome` marks editors whose dock renders the document identity, so record hosts mount them without a page header |
| Preview bindings | `previews: [{ type, surface, url, surfaceContract }]`, one per type |
| Preview channels | `previewChannels: [{ id, label, surface, url, surfaceContract }]` per plugin-declared designer preview tab (SPEC §28); channel ids are global across installs — a collision is a composition error |
| Client runtimes | `clientRuntimes: [{ organizationId, pluginId, version, runtime, services, nodeDefinitions, previewRenderers }]` for browser-capable JavaScript runtimes, operations, the normalized graph-node contracts of its browser-targeted managed services, and the install's declared preview surfaces resolved to module URLs |

A runtime binding's `nodeDefinitions` are derived from the install's managed
service declarations through the SDK's `nodeDefinitionFromService` builder
under the same palette gate the server resolver applies: managed mode,
`palette.visible !== false`, a declared palette group, and browser execution
support. Runtime-returned provider metadata keeps precedence; the served
declaration set fills operations the runtime does not contribute.

Editor bindings are file-type contracts: editor surfaces belong to
`file`-class (payload-bearing) types declared by the same plugin — the
SDK's listing contract enforces it. Each surface record's module URL is
the app's same-origin plugin-module proxy path
(`/api/plugins/:pluginId/module<module>`). Organization-owned installed
package assets serve this route first; a legacy endpoint origin remains a
migration fallback for packages whose assets have not been materialized. The bound preview
surface must be the install's own preview-kind surface; the client's
preview slots mount them read-only (see
[components/generated](../../../components/generated/README.md)).

## Access

Authoring, evolving, and removing organization type declarations requires
`organizations:admin`; reading the compiled organization registry requires
`organizations:read`. The API routes enforce these grants, not just the
designer screen.

## API

`GET /api/admin/cts/types` — merged org view (the class library, the
designer types pane, and the process designer's registry read this):
compiled types, diagnostics, attachment kinds, pack editor bindings, and
installed plugin surface declarations and browser runtime bindings. `POST /api/admin/cts/types` —
author/evolve a declaration. `DELETE /api/admin/cts/types/:id` — remove an
org type through the removal ceremony.

## Related

- [packages/cts](../../../packages/cts/README.md) — the type system itself.
- [pages/organization/README.md](../../../pages/organization/README.md) —
  the consuming designer surfaces.
