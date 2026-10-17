# COMPONENT: Framework Packages

Internal npm workspace packages used to extract the reusable industrial workflow framework from the Perigram application without breaking existing app imports.

## Package Map

| Package | Role |
|---|---|
| `@perigram/core` | Entity blocks, explicit registries, command/task/hook/attachment contracts |
| `@perigram/workflows` | Declarative workflow registry and transition validation |
| `@perigram/mongo` | Mongo-oriented repository, event-store, and summary adapter helpers |
| `@perigram/nitro` | Route metadata helpers for app/API adapters |
| `@perigram/vue` | Frontend route, surface, and attachment metadata helpers |
| `@perigram/devtools` | Architecture/data-model inspection helpers |
| `@perigram/mcp` | Read-only MCP tool handlers for schema/workflow/docs inspection |
| `@perigram/processes` | Organization process definition normalization, validation, and compilation |
| `@perigram/cts` | Perigram Type System: value universe, type declarations, classes, edges, states, operators, expressions, diffing, tenancy (see its `SPEC.md`) |
| `@perigram/plugin-sdk` | Plugin authoring SDK: listing contract (with JSON schema), executor harnesses, API client, and the `perigram-plugin` CLI |

Module boundaries, runtime relationships, and per-package contracts are
documented in each package's own `README.md`; the system-level graph lives in
[docs/SYSTEM_ARCHITECTURE.md](../docs/SYSTEM_ARCHITECTURE.md).

The committed [framework.manifest.json](../framework.manifest.json) is the read-only contract for LLM/RAG/MCP inspection. It combines package metadata, entity definitions, workflows, routes, commands, tasks, attachment kinds, summaries, inferred relationships, entity component contracts, shared design-system primitives, and token projections.

## Extraction Rule

Existing runtime imports stay in place until a package is proven by tests and wrapped by compatibility exports. Packages stay domain-agnostic; the facade domain is not a package — it is the installable plugin under `workers/facade`.

Nuxt, Nitro, Vite, and Vitest define `@perigram/*` aliases for tool/test contexts. Runtime app code uses Nuxt root aliases such as `~/packages/core/src/index.js`; avoid deep relative paths from server files because Nuxt dev output is executed from `.nuxt/dev`.
