# COMPONENT: @cutkit/workflows

Declarative lifecycle registry and transition validator. This package is persistence-agnostic; application adapters provide entity loading, event writing, authorization, and hooks.

`server/core/machines/service.js` uses `validateTransition()` as the runtime
validation step while the existing app definitions remain in
`server/core/machines/definitions.js`.

## Public API

- `defineWorkflow(type, workflow)`
- `getWorkflow(type)`
- `listWorkflows()`
- `validateTransition(context)`
- `createTransitionEngine(adapters)`
