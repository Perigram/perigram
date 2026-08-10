---
name: occs-compliance
description: Work with the Open Cassette Component Standard in CutKit, including OCCS cassette template/design specs, docs/specs/Cassette spec, utils/occs helpers, cassette designer OCCS output, semantic layer standards, OCCS migration, previews, baking, nesting inputs, or validation and review of OCCS documents.
---

# OCCS Compliance

Use this skill when changing or reviewing OCCS documents, cassette designer
output, semantic layer handling, previews, baking, nesting inputs, or related
migration work.

## First Reads

1. `AGENTS.md`
2. `docs/specs/README.md`
3. `docs/specs/Cassette spec/SPEC.md`
4. `utils/occs/README.md`

Load these only when the task needs them:

- `docs/specs/Cassette spec/VALIDATION.md` for document validation rules.
- `docs/specs/Cassette spec/Implementation.md` for generator/tooling behavior.
- `docs/specs/Cassette spec/MIGRATION_FROM_V0_1.md` and
  `docs/specs/cassette-occs-migration-plan.md` for legacy graph migration.
- `docs/specs/Cassette spec/LAYERS.md` and
  `docs/specs/Cassette spec/layers.json` for layer semantics.
- `server/features/cassettes/README.md`,
  `server/features/parametric-cassettes/README.md`, and
  `components/README.md` for app integration points.

## Invariants

- Keep OCCS template/design documents as canonical data. Do not split OCCS into a
  separate persistence model unless the task explicitly requires it.
- Store cassette OCCS definitions under the cassette `data.definition` contract;
  use `definition.occs` and `definition.documentType` as the discriminator.
- Keep `utils/occs/` pure: no stores, `$fetch`, Vue component APIs, or database
  calls.
- Preserve expression strings in templates. Resolve numeric values only for
  evaluated previews, designs, nesting inputs, or measurements.
- Use semantic OCCS layer codes from the registry or `utils/occs/layers.js`;
  avoid local hardcoded aliases.
- Route drawing output through the shared `DrawingCanvas` contract with explicit
  layer-standard codes.
- For backend persistence or baking changes, also apply the `cutkit-backend-v24`
  skill.
- For Vue component changes, also apply the `cutkit-vue-design-system` skill.

## Validation

Pick the narrowest checks that cover the touched behavior:

```bash
node "docs/specs/Cassette spec/tools/occs-toolkit.mjs" validate "docs/specs/Cassette spec/examples/simple-tray.occs.json"
npx vitest run utils/occs/evaluate.spec.js
npx vitest run utils/cassetteV2Renderer.spec.js
npx vitest run server/scripts/occs-layer-standards.spec.js
```

Use the OCCS toolkit against any new or changed `.occs.json` examples. Run
integration-specific tests when touching renderer, preview, layer-standard,
cassette, parametric-cassette, or nesting code.

## Documentation

Update `docs/specs/README.md`, the relevant OCCS spec file, `utils/occs/README.md`,
feature/component READMEs, and `TODO.md` Agent Notes when contracts, supported
shapes, layers, validation behavior, or migration behavior change.
