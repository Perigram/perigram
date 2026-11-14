# COMPONENT: Framework Packages

Internal npm workspace packages: the domain-agnostic industrial workflow framework the Perigram application and its workers are built on.

## Package Map

| Package | Role |
|---|---|
| [`@perigram/core`](./core/README.md) | Entity blocks, status and workflow lifecycle runtime, explicit registries, command/task/hook/attachment contracts |
| [`@perigram/processes`](./processes/README.md) | Organization process definition normalization, validation, and compilation |
| [`@perigram/cts`](./cts/README.md) | Perigram Type System: value universe, type declarations, classes, edges, states, operators, expressions, diffing, tenancy (see its `SPEC.md`) |
| [`@perigram/plugin-sdk`](./plugin-sdk/README.md) | Plugin authoring SDK: listing contract (with JSON schema), executor harnesses, API client, and the `perigram-plugin` CLI |

Module boundaries, runtime relationships, and per-package contracts are
documented in each package's own `README.md`; the system-level graph lives in
the [root README](../README.md) §Architecture.

The committed [framework.manifest.json](../framework.manifest.json) is the read-only contract for LLM/RAG/MCP inspection. It combines package metadata, entity definitions, workflows, routes, commands, tasks, attachment kinds, summaries, inferred relationships, entity component contracts, shared design-system primitives, and token projections.

## Boundaries

Packages stay domain-agnostic; the facade domain is the installable plugin under `workers/facade`.

Application code currently reaches workspace packages through Nuxt root aliases (`~/packages/<pkg>/src/index.js`) or portable `#packages/<pkg>/src/index.js` imports. These are source-path boundaries, not independently versioned package imports; §29 extraction must replace them with declared package dependencies and public exports.
