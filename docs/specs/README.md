# COMPONENT: Documentation Specs

`docs/specs` contains schema-level design notes for data and interchange
formats. These files describe contracts and intended structures; they are not
runtime modules.

## Specs

| Spec | Purpose |
|---|---|
| [Cassette spec](<./Cassette spec/SPEC.md>) | OCCS v0.4 draft package for canonical cassette templates/designs, declarative hardware/profile workpieces, semantic layers, validation, examples, and tooling. |
| [cassette-occs-migration-plan.md](./cassette-occs-migration-plan.md) | Maps the current CutKit cassette designer graph to OCCS and defines the migration path. |
| [nodi-operation-contract.md](./nodi-operation-contract.md) | Formal CutKit-to-Nodi3d operation manifest and compiler contract for OCCS evaluation. |
| [nodi-operation-manifest.schema.json](./nodi-operation-manifest.schema.json) | JSON Schema for validating Nodi3d operation manifests. |
| [nodi-occs-graph-checklist.md](./nodi-occs-graph-checklist.md) | Short build sheet for the first Nodi3d operation graphs needed to evaluate OCCS cassette templates. |
| [cassette-schema.md](./cassette-schema.md) | Legacy recursive cassette JSON format with expression fields, node attachment rules, cuts, children, and validation constraints. |
| [data-schema.md](./data-schema.md) | Documents current CNC nesting data structures, persistence collections, legacy compatibility notes, and related template/layer concepts. |

## Maintenance Notes

- Keep diagrams and examples synchronized with the schema text in the same file.
- Cross-link new specs from this README and from the root documentation map when
  they become part of the maintained project documentation.
