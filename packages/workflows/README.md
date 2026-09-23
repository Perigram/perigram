# COMPONENT: @perigram/workflows

Declarative lifecycle registry and transition validator. This package is persistence-agnostic; application adapters provide entity loading, event writing, authorization, and hooks.

`server/core/machines/service.js` uses `validateTransition()` as the runtime
validation step for CNC workflow definitions from `@perigram/domain-cnc`.

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

Workflows use the v2 region contract. A simple lifecycle is a single `main`
region; independent lifecycle axes can be added as additional regions.

```js
{
  schemaVersion: 2,
  primaryRegion: 'main',
  regions: {
    main: {
      initial: 'DRAFT',
      states: { DRAFT: {}, READY: {} },
      transitions: [{ from: 'DRAFT', to: 'READY', access: { permissions: [] } }]
    },
    qa: {
      initial: 'OPEN',
      states: { OPEN: {}, APPROVED: {} },
      transitions: [{ from: 'OPEN', to: 'APPROVED', access: { permissions: [] } }]
    }
  }
}
```

Runtime status snapshots store structured state:

```js
{
  schemaVersion: 2,
  primary: 'READY',
  active: { main: 'READY', qa: 'OPEN' },
  regions: {
    main: { state: 'READY', path: ['READY'] },
    qa: { state: 'OPEN', path: ['OPEN'] }
  }
}
```

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
        cassetteDesigns: { typeId: 'cassette_design', lineageKey: 'queueId' }
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
