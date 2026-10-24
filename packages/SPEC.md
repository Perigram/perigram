```yaml
doc_id: PACKAGES-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Framework packages workspace

`packages/` is the platform's framework library layer: the declaration
language, the process compiler, the domain kernel, the workflow runtime,
plugin authoring, and inspection tooling as internal npm workspace packages.
The application — Nuxt/Nitro server, designer, scripts — consumes packages;
packages carry zero application knowledge. The repository shape is owned by
the [root SPEC](../SPEC.md) §Deslopification; this SPEC owns the package
layer beneath it.

## Contracts owned here

### Package map

| Package | Owns | Contract home |
|---|---|---|
| `@perigram/cts` | CTS declaration language, type registry, projections | [cts SPEC](./cts/SPEC.md) |
| `@perigram/processes` | process compiler, designer authoring contract | [processes SPEC](./processes/SPEC.md) |
| `@perigram/core` | shared domain kernel: canonical blocks, explicit registries, command/task/hook/attachment contracts, definition validation | [core README](./core/README.md) |
| `@perigram/workflows` | workflow state-machine runtime, transition validation | [workflows README](./workflows/README.md) |
| `@perigram/plugin-sdk` | plugin listing contract with JSON schema, executor harnesses, API client, `perigram-plugin` CLI | [plugin-sdk README](./plugin-sdk/README.md) |
| `@perigram/devtools` | framework inspection, manifest assembly (`createFrameworkManifest`) | [devtools README](./devtools/README.md) |
| `@perigram/mcp` | read-only MCP tool handlers over the framework surface | [mcp README](./mcp/README.md) |

### Dependency direction law

- The application consumes packages; packages import no application code.
- Packages compose only downward through public barrels: `processes` and
  `workflows` may import `cts`; every package may import `core`; `cts` and
  `core` import no sibling.
- Cross-package imports are sibling-relative (`../../cts/src/index.js`).
  Application code reaches packages through Nuxt root aliases
  (`~/packages/<pkg>/src/index.js`) because Nitro dev output executes from
  `.nuxt/dev`; `@perigram/*` aliases in `nuxt.config.js`, `vitest.config.js`,
  `vitest.ssr.config.js`, and `tsconfig.json` serve tool and test contexts.
- App surfaces receive the species and operation vocabulary through
  `@perigram/processes` re-exports — the single vocabulary seam.

### Extraction rule

New shared framework code enters the application first; a module extracts
into `packages/` when a second consumer exists (root SPEC §Deslopification,
code cleanliness law 5). Packages stay domain-agnostic: domain content
arrives as plugin declarations (root SPEC §Plugin marketplace); the facade
domain is the installable plugin under `workers/facade`.

### Manifest law

The committed [framework.manifest.json](../framework.manifest.json) is the
read-only inspection contract for LLM, RAG, and MCP consumption.
`scripts/framework-inspect.js` `PACKAGE_NAMES` is the package inventory
source; `npm run framework:manifest` guards freshness and
`npm run framework:write-manifest` regenerates the file. Adding or removing
a package updates `PACKAGE_NAMES`, the regenerated manifest, and the alias
maps in the same cut; the alias maps list exactly the package map.

## Structure

One folder per package: `src/index.js` is the public barrel, specs sit
beside the modules they pin, and each package README documents its contracts
and links back here. `cts` and `processes` carry `SPEC.md` law; the
tooling packages are documented by README alone.

## Laws

| Consumed contract | Home |
|---|---|
| Repository shape, deslop done-means | [root SPEC](../SPEC.md) §Deslopification |
| Plugin listing and marketplace contract | [plugin-sdk README](./plugin-sdk/README.md); [root SPEC](../SPEC.md) §Plugin marketplace |
| System-level graph | [root README](../README.md) |

## End state

The workspace holds exactly the seven packages of the map; every package
export has a consumer; the manifest and the alias maps list exactly the map.
