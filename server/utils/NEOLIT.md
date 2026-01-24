# CODE: Standard Blocks Utility

Universal helpers for constructing and inheriting standardized data blocks according to v24 principles.

## Core Blocks
- **`identity`**: Standardizes naming and URL slugs.
- **`origin`**: Captures immutable creation context (User + Time).
- **`status`**: Standardized state snapshot for the UI.
- **`lineage`**: The critical "Cumulative Trace" object for ancestry tracking.
- **`specs`**: Unified physical DNA (thickness, dimensions).

## Lineage Inheritance Rule
The utility enforces the rule: `child.lineage = { ...parent.lineage, [parentType]Id: parent._id }`.

This ensures that every document carries its complete ancestry, enabling:
1. **Instant Reverse Lookups**: Find all descendants of any ancestor with one query.
2. **Multi-Tenant Isolation**: Natively filter by `lineage.organizationId`.

## Functions
- `createIdentity(name, slug, serial, reference)`
- `createStatus(state, userId, metadata)`
- `inheritLineage(parent, parentType)`
- `createSpecs(data)`
- `createSummary()`
