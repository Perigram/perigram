# COMPONENT: @perigram/workflows

Declarative lifecycle registry and transition validator. This package is persistence-agnostic; application adapters provide entity loading, event writing, authorization, and hooks.

Parent: [packages README](../README.md).

`server/core/machines/service.js` uses `validateTransition()` as the runtime
validation step for workflow definitions from declared types.

## Public API

- `defineWorkflow(type, workflow)`
- `getWorkflow(type)`
- `listWorkflows()`
- `normalizeWorkflow(workflow)`
- `createWorkflowState(workflow, overrides)`
- `applyWorkflowTransitionState(currentState, workflow, transition, targetState)`
- `getPrimaryState(statusOrState)`
- `getRegionState(statusOrState, regionId)`
- `validateTransition(context)`
- `normalizeLifecycle(lifecycle)`
- `validateLifecyclePayload(schema, lifecycle)`
- `validateActorGuard(context)`
- `createTransitionEngine(adapters)`
- `getWorkflowRegions(workflow)`
- `getWorkflowRegion(workflow, regionId)`
- `hasLifecyclePayload(lifecycle)`
- `workflowStateEntries(region)`
- `resolveWorkflowStatePath(region, state)`
- `workflowTransitionsForState(region, state)`

## Workflow Shape

Workflows use the v2 region contract. Regions are independent lifecycle
axes. Hierarchy inside one axis is expressed by recursive `states`, never by
extra regions. A state with children has its own `initial` child; transitions
use canonical dotted state paths.

```js
{
  schemaVersion: 2,
  primaryRegion: 'main',
  regions: {
    main: {
      initial: 'PRODUCTION.cut',
      states: {
        PRODUCTION: {
          initial: 'queued',
          states: {
            queued: {},
            cutting: {}
          }
        },
        DONE: {}
      },
      transitions: [
        { from: 'PRODUCTION.queued', to: 'PRODUCTION.cutting' },
        { from: 'PRODUCTION.cutting', to: 'DONE' }
      ]
    },
    qa: {
      initial: 'OPEN',
      states: { OPEN: {}, APPROVED: {} },
      transitions: [{ from: 'OPEN', to: 'APPROVED', access: { permissions: [] } }]
    }
  }
}
```

Runtime status snapshots store the active leaf path for each region. The
workflow tree derives ancestry and the entered-child path; it does not store a
second copy of the declaration as flat dotted enum values.

```js
{
  schemaVersion: 2,
  primary: 'PRODUCTION.cutting',
  active: { main: 'PRODUCTION.cutting', qa: 'OPEN' },
  regions: {
    main: { state: 'PRODUCTION.cutting', path: ['PRODUCTION', 'cutting'] },
    qa: { state: 'OPEN', path: ['OPEN'] }
  }
}
```

Transition lookup walks the active leaf's ancestor paths from most-specific
to least-specific. The first declared transition wins. A target is entered
as a leaf under the parent-is-leaf law (CTS SPEC §7): entering a parent
state lands on the parent, a nested child by targeting it explicitly.
Leaving a parent exits the complete descendant configuration. Creation
enters the region's configured initial leaf.
`resolveWorkflowStatePath` accepts a canonical dotted path or a local state
name, resolving the latter to the one canonical path that carries it. These
rules are owned here; the CTS projection supplies the recursive tree and
canonical paths.

Workflow states may declare lifecycle payload schemas:

```js
states: {
  MILLED: {
    canUpdateLifecycle: true,
    lifecycle: {
      actors: ['operator', 'mounting'],
      attachments: {
        geometry: { multiple: false, required: true, kind: 'geometry-proof' },
        photos: { multiple: true }
      },
      description: { required: true },
      snapshots: {
        panels: { typeId: 'panel', lineageKey: 'projectId' }
      },
      data: true
    }
  }
}
```

`validateTransition()` checks declared attachment slots, required lifecycle
attachments, declared snapshot keys, actor capability names, optional transition
`capabilities`, and current `status.lifecycle.actors` assignments that apply to
the target state. Actors are assignment facts: an actors-only payload passes a
state without a lifecycle schema; evidence slots (attachments, data, snapshots)
still refuse there. Runtime adapters may pass `requireLifecyclePayload: false`
when listing available actions so required evidence can be collected by the UI
before the transition is submitted.
Application role names are not workflow policy. Runtime adapters evaluate
transition `access.permissions` through their access layer.

Transition objects may also carry UI-only presentation metadata such as
`display: 'inline' | 'menu' | 'hidden'`. The workflow validator ignores this
field; frontend adapters use it to place actions in `InstanceState`.

A transition may carry a `guard`: a boolean expression AST authored and
compiled under CTS SPEC §7. `normalizeWorkflow` preserves it verbatim;
evaluation belongs to the status runtime, which re-evaluates it at commit
against the loaded instance and hides guard-failing edges from action
availability (see
[server/core/machines](../../server/core/machines/README.md)).

Transitions may also carry `deadline: true` (with `access.system`) — the
compiled escalation edge of a declared state deadline (CTS SPEC §7); the deadline-edge
runtime contract lives in
[server/core/machines](../../server/core/machines/README.md).
The marker is provenance for tooling; authorization and execution are
owned by the access layer and the deadline scanner.
