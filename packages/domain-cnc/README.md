# COMPONENT: @cutkit/domain-cnc

Cutkit CNC domain definitions for the framework extraction. This package is the only package allowed to know about queues, cassettes, sheets, nesting, remnants, and manufacturing-specific workflows.

## Contents

- Entity definitions for current v24 persisted production, master-data, material, and system entities.
- Frontend endpoint definitions for the app's `useEntity` type keys.
- Runtime workflow definitions consumed by `server/core/machines/definitions.js`.
- Service contract/action definitions and typed hook contracts consumed by the server runtime and admin editors.
- Design-system entity contracts, primitive metadata, groups, and variants that
  define CNC UI policy without importing Vue components.
- Summary definitions replacing hardcoded aggregator rules in a later migration.
- Summary definitions consumed by the current Mongo aggregator adapter.

The framework manifest includes CNC primitives that application builders can compose directly, including layer standards, pen templates, tool profiles, and materials. Runtime support collections such as sessions, invitations, audit events, and preset options stay outside this package unless they become first-class app entities.

## Builder Tool

The app exposes `/admin/domain-builder` as a browser-export development tool for
this package. It loads the current package definitions, lets authenticated users
edit entities, frontend routes, workflows, lifecycle schemas, hooks, operations,
and summaries in localStorage. The workflow editor is graph-first: statuses are
Vue Flow core nodes, transitions are Vue Flow edges with compact
role/capability/hook summary labels, reciprocal transitions use curved routing,
transitions can be created by connecting nodes or selecting source and target
statuses, and the selected node/edge side panel owns lifecycle, access, and hook
properties. Manual graph layout is browser-local UI state and is not exported
into this package. The tool validates the draft and exports generated JS. The
tool intentionally does not write source files or introduce an alternate runtime
format; this package remains the source of truth.

## Workflow Lifecycle Schemas

`cncWorkflows` owns manufacturing-specific states, transitions, hooks, and
optional lifecycle schemas. Lifecycle schemas describe which current-state facts
may be stored in `status.lifecycle` for a state, for example generic
`geometry`/`photos` attachment slots, actor capability assignments, and measured
state data. Current mutable location is represented as
`status.lifecycle.data.location` with typed values such as `warehouse`,
`coordinates`, or `address`; ancestry still belongs in `lineage`, and files
belong in `attachments`. Transition-local notes and reasons stay in
`status.metadata`.

Transitions may include `display: 'inline' | 'menu' | 'hidden'` as a frontend
presentation hint for `EntityStatus`. Primary workflow progressions are inline,
destructive or lower-priority transitions are menu actions, and self-loop
metadata transitions are hidden from status action buttons.

Transition access uses `access.permissions` and optional lifecycle
`capabilities`; workflow definitions do not authorize with application role
names.

## Services

`cncServiceContracts` declares CNC processing services without implementation
details. `cncOperations` declares callable work on those services with typed
entity inputs, typed `parameters`, output groups, triggers, and required access
permissions. Execution bodies use `{ entities, parameters }`.
`cncServiceActions` is retained as a compatibility alias for older tooling.

`saveCassetteTemplate` is action `saveTemplate` on the `cassettes` service. It
is the cassette designer save boundary: the client submits a designer definition
and optional existing cassette reference, and the server creates or updates the
canonical cassette template through the cassette feature service.

`solveNesting` is action `solve` on the `nesting` service. It accepts a `queue`,
material source settings, sheet geometry, and optional tool profile, then starts
the `nesting.solve` process run that produces a `nesting_run` and eventual
`sheet_design` records. It can be triggered by `queue.nestingRequested`.

`generateArtifact` is action `generate` on the `artifacts` service. It accepts a
source entity such as `sheet_design` or `nesting_run` plus an artifact type,
then creates a generated artifact request such as `LAYOUT_DXF` or
`PDF_PASSPORT`. The queue nesting endpoint composes service actions instead of
using a single action that both solves nesting and creates artifacts.

## Processes, Artifacts, And UI Metadata

`cncProcesses` declares CNC async processes such as DXF parsing, cassette
template baking, nesting solve execution, and artifact generation. These
definitions describe inputs, outputs, and executor shape; server adapters and
workers implement the actual IO.

`cncArtifactTypes` declares generated file types, storage buckets, MIME types,
and preview modes. UI and API adapters should use this metadata instead of
inferring behavior from filenames.

`cncDesignSystem` declares entity UI contracts and shared primitive metadata.
`utils/design-system-contract.js` is a compatibility export plus validation
helper; new framework tooling should read the contract from this package.

`cncDomain` aggregates entities, workflows, services, operations, processes,
artifact types, summaries, hooks, and UI metadata into one source of truth.
`domain-cnc` may declare icons, routes, field paths, and surface capabilities,
but it must not import Vue, Nuxt, MongoDB, or worker implementation code.

`cncHookContracts` declares typed settings for lifecycle transition hooks.
Transition instances still store `{ handler, params }`, but admin editors and
validators resolve `params` through the hook contract. `propagateToChildren`
requires `childType` and a workflow-state-aware `childState`; aggregator and
physical-production hooks currently have no parameters.

## Related

- [server/features/README.md](../../server/features/README.md)
- [server/core/machines/README.md](../../server/core/machines/README.md)
