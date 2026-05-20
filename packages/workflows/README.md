# COMPONENT: @cutkit/workflows

Declarative lifecycle registry and transition validator. This package is persistence-agnostic; application adapters provide entity loading, event writing, authorization, and hooks.

`server/core/machines/service.js` uses `validateTransition()` as the runtime
validation step for CNC workflow definitions from `@cutkit/domain-cnc`.

## Public API

- `defineWorkflow(type, workflow)`
- `getWorkflow(type)`
- `listWorkflows()`
- `validateTransition(context)`
- `normalizeLifecycle(lifecycle)`
- `validateLifecyclePayload(schema, lifecycle)`
- `validateActorGuard(context)`
- `createTransitionEngine(adapters)`

## Lifecycle Validation

Workflow states may declare lifecycle payload schemas:

```js
states: {
  MILLED: {
    canUpdateLifecycle: true,
    lifecycle: {
      actors: ['operator', 'mounting'],
      attachments: {
        geometry: { multiple: false },
        photos: { multiple: true }
      },
      data: true
    }
  }
}
```

`validateTransition()` checks declared attachment slots,
actor capability names, optional transition `capabilities`, and current
`status.lifecycle.actors` assignments that apply to the target state.
Application role names are not workflow policy. Runtime adapters evaluate
transition `access.permissions` through their access layer.

Transition objects may also carry UI-only presentation metadata such as
`display: 'inline' | 'menu' | 'hidden'`. The workflow validator ignores this
field; frontend adapters use it to place actions in `EntityStatus`.
