# Platform Convergence Roadmap

The platform's core idea is an invariant, not a feature: the platform holds
no business truth. Everything about how an organization runs is a typed
declaration the organization authors; the platform compiles declarations into
contracts and interprets contracts generically. A declaration is the only
home for business truth; everything derived from one — compiled contracts,
screens, grants, migrations of live data — is a cache or a program, never a
second source of truth.

This roadmap names the three places that invariant is not yet enforced, in
the order they close. Each section states the current reality, the target
contract, and the concrete steps. Parent: [root README](../README.md).

## 1. Declarative instance migration

**Landed (process level):** workflow-status migrations are declarations. When
the next compiled contract removes primary states still held by live
instances, Apply pauses on a migration plan; the decision is authored data on
the definition (`data.migrations.statuses`), validated at activation, and
executed as idempotent initial-state re-targets with an applied summary
persisted beside the declarations. Canonical contract:
[server/features/process-definitions/README.md](../server/features/process-definitions/README.md).

**Type level (CTS SPEC §11): landed.** Type declarations carry
`migrate` steps so a breaking declaration diff is a compiled migration
instead of a registry refusal:

- The diff classification is complete (`add-state`/`add-edge` included);
  rename intent stays a declared step, never an inference from the diff.
- The step language is declarative and total, per SPEC §11: rename
  (enum value, field), add default, remove, retype via CEL expression.
  A breaking diff without a covering declaration is a compile error
  (R7); a declared step matching nothing fails the gate as well.
- Execution runs at the declaration boundary (`cts-types` defineType,
  which the designer's Apply hits when it posts tree declarations):
  idempotent, org-scoped instance rewrites through the instances
  feature's executor, with the applied summary persisted on the
  declaration. Offloading to the task runtime is a later execution
  optimization, not a contract change.
- The one-off `server/scripts/migrate-*.js` files retire concern by
  concern as each becomes a declarable step.

## 2. Definition-plane closure — definitions are instances

**Current reality:** process definitions are a special plane. They persist
through a private feature repository and model (`ProcessDefinition`), run a
bespoke lifecycle (`applyProcessState`: DRAFT/ACTIVE/ARCHIVED), expose
dedicated validate/activate/run endpoints, and are authored through a bespoke
surface (`pages/organization/process.vue` + canvas round-trip protocols). The
platform therefore has two runtimes: generic instance services for every
declared type, and definition-shaped machinery for the definitions
themselves.

**Target contract:** a process definition is an entity like any declared
type. Its lifecycle is a workflow (draft/apply/archive are states and
transitions through [server/core/machines](../server/core/machines/README.md)),
its persistence resolves through the registry's instance-service boundary
(the `process_definition` framework service already registered in
[server/runtime](../server/runtime/README.md)), its compiled snapshot is a
derived cache recomputed from authored records, and its authoring surface is
a generated screen rendered through the same ui-mapping contract every other
screen uses. One runtime; the definition plane is deleted, not bridged.

**Steps (strangler order, each deletes its predecessor's machinery in the
same cut):**

1. Model the definition lifecycle as a declared workflow and retire
   `applyProcessState`; activation becomes a transition with the apply
   migration gate as its guard.
2. Move definition persistence behind the registered `process_definition`
   instance service; the feature keeps only compilation and the apply
   boundary as behavior.
3. Author the designer as a process-generated surface: canvas, panels, and
   validation feedback become screen-contract panes through
   [shared/ui-mapping](../shared/ui-mapping/README.md); the compile
   preview pipeline already exercises this path client-side.
4. Fold dedicated routes and designer composables into generated screens as
   each step lands; the end state has no `process.vue`-shaped special case.

**Invariant guard:** no persisted derived state on definitions that cannot
be recomputed from their authored records. Contracts are caches; migrations
are declarations (initiative 1).

## 3. Organization protocol exchange — OUT-GAP-IN

**Target contract:** because business truth is declarations, declarations are
portable across tenants. A tenant boundary is a protocol boundary: an
organization publishes a versioned definition (a type, a subgraph, or a whole
process) as an OUT artifact; a recipient organization installs it and runs it
under its own grants; a reply arrives through a typed IN structure the
published definition dictates. Multi-tenancy stops being isolation and
becomes typed exchange — the org-to-org counterpart of packs.

**Design anchors that already exist:**

- Socket projection already models cross-organization typed projection: the
  outbound socket API copies declared projection fields and carries receiver
  lifecycle metadata (see the socket projection section of
  [server/features/process-definitions/README.md](../server/features/process-definitions/README.md)).
- CTS tenancy already resolves one organization's view over system types
  without shadowing (SPEC §4); an installed definition is a new resolution
  source with the same no-shadowing rule.
- Apply migration (initiative 1) is the safety story for installing a
  definition over live instances: the diff and plan machinery treats the
  installed definition exactly like a local apply.

**Open decisions (human-owned, tracked in SPEC.md's OUT-GAP-IN sketch):**
what a recipient may adapt locally without forking the published version,
how replies bind to the publishing org's IN structures, and the visibility
model for published artifacts. The platform contract lands only after those
are decided; nothing here pre-builds them.

## Related

- [System architecture](./SYSTEM_ARCHITECTURE.md)
- [CTS spec (§11 evolution, §19 build order)](../packages/cts/SPEC.md)
- [Process definitions (Apply migration contract)](../server/features/process-definitions/README.md)
- [Runtime registry](../server/runtime/README.md)
