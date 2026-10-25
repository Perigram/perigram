# COMPONENT: Framework Packages

Internal npm workspace packages: the domain-agnostic industrial workflow framework the Perigram application and its workers are built on.

## Package Map

| Package | Role |
|---|---|
| [`@perigram/core`](./core/README.md) | Entity blocks, explicit registries, command/task/hook/attachment contracts |
| [`@perigram/workflows`](./workflows/README.md) | Declarative workflow registry and transition validation |
| [`@perigram/devtools`](./devtools/README.md) | Architecture/data-model inspection helpers |
| [`@perigram/mcp`](./mcp/README.md) | Read-only MCP tool handlers for schema/workflow/manifest inspection |
| [`@perigram/processes`](./processes/README.md) | Organization process definition normalization, validation, and compilation |
| [`@perigram/cts`](./cts/README.md) | Perigram Type System: value universe, type declarations, classes, edges, states, operators, expressions, diffing, tenancy (see its `SPEC.md`) |
| [`@perigram/plugin-sdk`](./plugin-sdk/README.md) | Plugin authoring SDK: listing contract (with JSON schema), executor harnesses, API client, and the `perigram-plugin` CLI |

Module boundaries, runtime relationships, and per-package contracts are
documented in each package's own `README.md`; the system-level graph lives in
the [root README](../README.md) §Architecture.

The committed [framework.manifest.json](../framework.manifest.json) is the read-only contract for LLM/RAG/MCP inspection. It combines package metadata, entity definitions, workflows, routes, commands, tasks, attachment kinds, summaries, inferred relationships, entity component contracts, shared design-system primitives, and token projections.

## Boundaries

Packages stay domain-agnostic; the facade domain is the installable plugin under `workers/facade`.

Nuxt, Nitro, Vite, and Vitest define `@perigram/*` aliases for tool/test contexts. Runtime app code uses Nuxt root aliases such as `~/packages/core/src/index.js`; avoid deep relative paths from server files because Nuxt dev output is executed from `.nuxt/dev`.
