# COMPONENT: Server Runtime Registry

Builds the explicit application registry used by backend runtimes.

`app-registry.js` creates one `createRegistry()` instance, defines
`@cutkit/domain-cnc`, registers entity services, command handlers, and workflow
hook handlers. Backend runtimes consume this registry instead of importing
domain packages or feature modules directly.

`entities.js` resolves entity type aliases and collection names from the active
registry/domain metadata. Runtime code such as status transitions, hooks, and
summary aggregation must use these helpers instead of hardcoded pluralization
rules.

`cutkit-registry.js` is a compatibility re-export for older imports; new code
should call `getAppRegistry()`.

## Registered Bindings

- Entity services for every persisted domain entity declared in
  `@cutkit/domain-cnc`.
- Command handlers: `saveCassetteTemplate`, `solveNesting`,
  `generateAttachment`.
- Workflow hook handlers from `server/core/machines/hooks.js` and explicitly
  registered feature hook handlers such as queue physical-cut processing.
- Domain definitions: entities, workflows, commands, tasks, hooks,
  attachment kinds, summaries, and UI metadata.

## Related

- [Core package](../../packages/core/README.md)
- [Commands](../core/commands/README.md)
- [Tasks](../core/tasks/README.md)
