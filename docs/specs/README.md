# COMPONENT: Documentation Specs

`docs/specs` contains schema-level design notes for data and interchange
formats. These files describe contracts and intended structures; they are not
runtime modules.

## Specs

| Spec | Purpose |
|---|---|
| [cassette-schema.md](./cassette-schema.md) | Defines the recursive cassette JSON format, expression fields, node attachment rules, cuts, children, and validation constraints. |
| [data-schema.md](./data-schema.md) | Documents current CNC nesting data structures, persistence collections, legacy compatibility notes, and related template/layer concepts. |

## Maintenance Notes

- Keep diagrams and examples synchronized with the schema text in the same file.
- Cross-link new specs from this README and from the root documentation map when
  they become part of the maintained project documentation.
