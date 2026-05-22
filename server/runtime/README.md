# COMPONENT: Server Runtime Registry

Builds the explicit application registry used by backend runtimes.

`app-registry.js` creates one `createRegistry()` instance, defines
`@cutkit/domain-cnc`, registers entity services, command handlers, and workflow
hook handlers. Backend runtimes consume this registry instead of importing
domain packages or feature modules directly.

`cutkit-registry.js` is a compatibility re-export for older imports; new code
should call `getAppRegistry()`.

## Registered Bindings

- Entity services for canonical feature modules.
- Command handlers: `saveCassetteTemplate`, `solveNesting`,
  `generateAttachment`.
- Workflow hook handlers from `server/core/machines/hooks.js`.
- Domain definitions: entities, workflows, commands, tasks, hooks,
  attachment kinds, summaries, and UI metadata.

## Related

- [Core package](../../packages/core/README.md)
- [Commands](../core/commands/README.md)
- [Tasks](../core/tasks/README.md)
