# COMPONENT: Framework Packages

Internal npm workspace packages used to extract the reusable industrial workflow framework from the Cutkit application without breaking existing app imports.

## Package Map

| Package | Role |
|---|---|
| `@cutkit/core` | Entity blocks, entity registry, serialization helpers, entity service contracts, and service action contracts |
| `@cutkit/workflows` | Declarative workflow registry and transition validation |
| `@cutkit/mongo` | Mongo-oriented repository, event-store, and summary adapter helpers |
| `@cutkit/nitro` | Route metadata helpers for app/API adapters |
| `@cutkit/vue` | Frontend entity route registry helpers |
| `@cutkit/devtools` | Architecture/data-model inspection helpers |
| `@cutkit/mcp` | Read-only MCP tool handlers for schema/workflow/docs inspection |
| `@cutkit/domain-cnc` | Cutkit CNC entity, workflow, summary, service contract, and service action definitions |

Current extraction status, module boundaries, runtime relationships, and Mermaid diagrams are maintained in [docs/FRAMEWORK_EXTRACTION_STATUS.md](../docs/FRAMEWORK_EXTRACTION_STATUS.md).

The committed [framework.manifest.json](../framework.manifest.json) is the read-only contract for LLM/RAG/MCP inspection. It combines package metadata, entity definitions, workflows, routes, summaries, inferred relationships, entity component contracts, shared design-system primitives, and token projections.

## Extraction Rule

Existing runtime imports stay in place until a package is proven by tests and wrapped by compatibility exports. Packages must stay domain-agnostic except `@cutkit/domain-cnc`.

Nuxt, Nitro, Vite, and Vitest define `@cutkit/*` aliases for tool/test contexts. Runtime app code uses Nuxt root aliases such as `~/packages/core/src/index.js`; avoid deep relative paths from server files because Nuxt dev output is executed from `.nuxt/dev`.
