# COMPONENT: @perigram/workflows

Declarative lifecycle registry and transition validator. This package is persistence-agnostic; application adapters provide entity loading, event writing, authorization, and hooks.

`server/core/machines/service.js` uses `validateTransition()` as the runtime
validation step for CNC workflow definitions from `@perigram/facade`.

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
to least-specific. The first declared transition wins. A target child enters
its ancestors; a target state with children enters that state's initial child;
leaving a parent exits the complete descendant configuration. Creation enters
the region's configured initial leaf. These rules are owned here; the CTS
projection supplies the recursive tree and canonical paths.

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
the target state. Runtime adapters may pass `requireLifecyclePayload: false`
when listing available actions so required evidence can be collected by the UI
before the transition is submitted.
Application role names are not workflow policy. Runtime adapters evaluate
transition `access.permissions` through their access layer.

Transition objects may also carry UI-only presentation metadata such as
`display: 'inline' | 'menu' | 'hidden'`. The workflow validator ignores this
field; frontend adapters use it to place actions in `InstanceState`.
