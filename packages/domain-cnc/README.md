# COMPONENT: @cutkit/domain-cnc

Cutkit CNC domain definitions for the framework extraction. This package is the only package allowed to know about queues, cassettes, sheets, nesting, remnants, and manufacturing-specific workflows.

## Contents

- Entity definitions for current v24 persisted production, master-data, material, and system entities.
- Frontend endpoint definitions for the app's `useEntity` type keys.
- Runtime workflow definitions consumed by `server/core/machines/definitions.js`.
- Summary definitions replacing hardcoded aggregator rules in a later migration.
- Summary definitions consumed by the current Mongo aggregator adapter.

The framework manifest includes CNC primitives that application builders can compose directly, including layer standards, pen templates, tool profiles, and materials. Runtime support collections such as sessions, invitations, audit events, and preset options stay outside this package unless they become first-class app entities.

## Builder Tool

The app exposes `/admin/domain-builder` as a browser-export development tool for
this package. It loads the current package definitions, lets authenticated users
edit entities, frontend routes, workflows, lifecycle schemas, hooks, and
summaries in localStorage. The workflow editor is graph-first: statuses are
Vue Flow core nodes, transitions are Vue Flow edges with role/capability/hook
labels, transitions can be created by connecting nodes or selecting source and
target statuses, and the selected node/edge side panel owns lifecycle, access,
and hook properties. Manual graph layout is browser-local UI state and is not
exported into this package. The tool validates the draft and exports generated
JS. The
tool intentionally does not write source files or introduce an alternate runtime
format; this package remains the source of truth.

## Workflow Lifecycle Schemas

`cncWorkflows` owns manufacturing-specific states, transitions, hooks, and
optional lifecycle schemas. Lifecycle schemas describe which current-state facts
may be stored in `status.lifecycle` for a state, for example generic
`geometry`/`photos` attachment slots, actor capability assignments, and measured
state data. Transition-local notes and reasons stay in `status.metadata`.

## Related

- [server/features/README.md](../../server/features/README.md)
- [server/core/machines/README.md](../../server/core/machines/README.md)
