```yaml
doc_id: PACKAGES-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-11-14
```

# SPEC: Framework packages workspace

`packages/` is the platform's framework library layer: the declaration
language, process compiler, domain kernel (including lifecycle runtime),
and plugin authoring. Framework inspection and MCP transport are application
tooling under `scripts/`, not domain packages. The application consumes
packages; packages carry zero application knowledge. The repository shape is owned by
the [root SPEC](../SPEC.md) §23; this SPEC owns the package
layer beneath it.

## Contracts owned here

### Package map

| Package | Owns | Contract home |
|---|---|---|
| `@perigram/cts` | CTS declaration language, type registry, projections | [cts SPEC](./cts/SPEC.md) |
| `@perigram/processes` | process compiler, designer authoring contract | [processes SPEC](./processes/SPEC.md) |
| `@perigram/core` | shared domain kernel: canonical blocks, status/workflow lifecycle runtime, explicit registries, command/task/hook/attachment contracts, definition validation | [core README](./core/README.md) |
| `@perigram/plugin-sdk` | plugin listing contract with JSON schema, executor harnesses, API client, `perigram-plugin` CLI | [plugin-sdk README](./plugin-sdk/README.md) |

### Dependency direction law

- The application consumes packages; packages import no application code.
- Packages compose only downward through public barrels: `processes` depends
  on `@perigram/cts` and `@perigram/core`; `cts`, `core`, and `plugin-sdk`
  have no sibling dependencies.
- Internal package code imports siblings by package name, and the `processes`
  manifest declares exact compatible workspace versions. Application code
  still reaches packages through Nuxt root aliases (`~/packages/<pkg>/src/index.js`)
  or portable `#packages/<pkg>/src/index.js` imports. Those app source-path
  imports are transitional; extraction must replace them with declared,
  versioned package dependencies.
- App surfaces receive the species and operation vocabulary through
  `@perigram/processes` re-exports — the single vocabulary seam.

### Extraction rule

New shared framework code enters the application first; a module extracts
into `packages/` when a second consumer exists (root SPEC §23,
code cleanliness law 5). Packages stay domain-agnostic: domain content
arrives as plugin declarations (root SPEC §20); the facade
domain is the installable plugin under `workers/facade`.

### Manifest law

The committed [framework.manifest.json](../framework.manifest.json) is the
read-only inspection contract for LLM, RAG, and MCP consumption.
`scripts/framework-inspect.js` `PACKAGE_NAMES` is the curated package list
represented in that manifest, not the npm workspace package map.
`npm run framework:manifest` guards freshness and
`npm run framework:write-manifest` regenerates the file. Workspace package
changes update the package map; manifest metadata changes update
`PACKAGE_NAMES` and the generated manifest. The workspace package map is
four entries: `cts`, `processes`, `core`, and `plugin-sdk`.

## Structure

One folder per package: `src/index.js` is the public barrel, specs sit
beside the modules they pin, and each package README documents its contracts
and links back here. `cts` and `processes` carry `SPEC.md` law; the
the plugin SDK is documented by README alone.

## Laws

| Consumed contract | Home |
|---|---|
| Repository shape, deslop done-means | [root SPEC](../SPEC.md) §23 |
| Plugin listing and marketplace contract | [plugin-sdk README](./plugin-sdk/README.md); [root SPEC](../SPEC.md) §20 |
| System-level graph | [root README](../README.md) |

## End state

The workspace holds exactly the four packages of the map; every package
export has a consumer. The manifest is a curated inspection projection, not
a duplicate of the workspace inventory.
