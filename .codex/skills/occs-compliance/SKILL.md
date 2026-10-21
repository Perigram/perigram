---
name: occs-compliance
description: Work with the Open Cassette Component Standard in Perigram, including OCCS cassette template/design specs, workers/facade/occs/spec, workers/facade/occs helpers, cassette designer OCCS output, semantic layer standards, OCCS migration, previews, baking, nesting inputs, or validation and review of OCCS documents.
---

# OCCS Compliance

Use this skill when changing or reviewing OCCS documents, cassette designer
output, semantic layer handling, previews, baking, nesting inputs, or related
migration work.

## First Reads

1. `AGENTS.md`
2. `workers/facade/occs/README.md`

Load these only when the task needs them:

- `workers/facade/occs/spec/layers.json` and `layers.csv` for layer
  semantics.
- `workers/facade/occs/spec/occs.schema.json` and `spec/examples/` for
  document shape and sample documents.
- `server/packs/facade/cassettes/README.md`,
  `server/features/parametric-cassettes/README.md`, and
  `components/README.md` for app integration points.

## Invariants

- Keep OCCS template/design documents as canonical data. Do not split OCCS into a
  separate persistence model unless the task explicitly requires it.
- Store cassette OCCS definitions under the cassette `data.definition` contract;
  use `definition.occs` and `definition.documentType` as the discriminator.
- Keep `workers/facade/occs/` pure: no stores, `$fetch`, Vue component APIs, or database
  calls.
- Preserve expression strings in templates. Resolve numeric values only for
  evaluated previews, designs, nesting inputs, or measurements.
- Use semantic OCCS layer codes from the registry or `workers/facade/occs/layers.js`;
  avoid local hardcoded aliases.
- Route drawing output through the shared `DrawingCanvas` contract with explicit
  layer-standard codes.
- For backend persistence or baking changes, also apply the `perigram-backend-v24`
  skill.
- For Vue component changes, also apply the `perigram-vue-design-system` skill.

## Validation

Pick the narrowest checks that cover the touched behavior:

```bash
npx vitest run workers/facade/occs/evaluate.spec.js
npx vitest run workers/facade/surfaces/lib/cassetteV2Renderer.spec.js
npx vitest run server/scripts/occs-layer-standards.spec.js
```

Check new or changed `.occs.json` examples against
`workers/facade/occs/spec/occs.schema.json`. Run
integration-specific tests when touching renderer, preview, layer-standard,
cassette, parametric-cassette, or nesting code.

## Documentation

Update `workers/facade/occs/README.md`, the OCCS spec package under
`workers/facade/occs/spec/`, feature/component READMEs, and `TODO.md` Agent
Notes when contracts, supported shapes, layers, validation behavior, or
migration behavior change.
