# CODE: Instance Filters

The canonical instance-filter vocabulary: one structured filter tree that the
server list transport, the generated-screen composition, and the collection
toolbar all speak, so instance selection semantics are defined once instead
of three times. Pure data and pure functions — no Vue, Nuxt, Mongo, or
domain imports; browser-safe and Node-safe by construction.

Parent: [shared/README.md](../README.md).

## Filter tree

A filter node is one of:

- `{ and: [node, ...] }` — conjunction;
- `{ or: [node, ...] }` — disjunction;
- `{ not: node }` — negation;
- `{ field, op, value }` — one predicate over a field address.

The closed operator set is `eq`, `in` (array value), `contains`
(case-insensitive substring), and the ordering operators `gt`, `gte`,
`lt`, `lte` (numeric when both sides parse as numbers, else lexicographic —
ISO instants compare correctly as strings). Operators exist because a
consumer expresses them; the set grows when a consumer needs a new one.

### Field addresses

Addresses read the CTS §3 instance shape (the screen instance projection of
`utils/instance-shape.js`), never storage paths:

| Address | Reads |
|---|---|
| `_id` / `id` | the instance id |
| `states.main` | the primary status |
| `lineage.<key>` | the lineage ref's id (object ref or raw scalar) |
| any other name | `fields.<name>`; quantity values compare by `.value` |
| `relations.<key>` / `relations.<key>.<field>` | the relation slot; traversal reads any target of the relation whose field matches |
| `lineage.<key>.<field>` | the ancestor stored under the lineage key |
| `children.<type>.<field>` | any pool instance of the type whose lineage points back |

Traversal addresses are one hop, existentially quantified (ANY related
instance matching satisfies the predicate), and resolve through the
caller's instance pool (`{ type -> { id -> instance } }`), passed as
`instanceMatchesFilter(instance, node, { pool })`. Without a pool — or
when the related instances are not loaded — the axis is unresolvable and
the predicate is a no-op, never a failure.

### Normalization

`normalizeFilter(node)` is total and deterministic: combinators with no
surviving children collapse (empty conjunction is the match-all `null`),
single-child combinators collapse to the child, predicates with empty
values (`null`, `undefined`, `''`, empty array) or unknown shapes and
operators are dropped as no-ops, and the result is frozen. A malformed
subtree never fails a surface — it stops constraining it. This mirrors the
resolver philosophy in
[shared/ui-mapping](../ui-mapping/README.md): total resolution, no
authored exceptions.

## Flat transport projection

Compiled screen sources emit a flat scalar filter map; it is defined as a
projection of the tree — `filterFromFlatFilters(flat, { lineageKeys })`
expands it into a conjunction:

| Flat key | Predicate |
|---|---|
| `_id` | `eq` on `_id` |
| `primaryState` | `eq` on `states.main` |
| `primaryStates` | `in` on `states.main` (comma-split) |
| declared lineage key (bare) | `eq` on `lineage.<key>` |
| `lineage.<key>` (dotted) | `eq` on `lineage.<key>` |

`limit` and `skip` are transport parameters, not filters, and are dropped.
Empty values drop; an array value contributes its first entry (repeated
query keys).

`lineageKeys` is the caller's declared-vocabulary gate. The generic
instance service passes the registry-derived declared lineage key set
(SPEC §6): an undeclared key is transport noise and never becomes a query
path. Without a set (client composition over synthetic or edge-less
bundles) every bare key reads as a lineage key — the total default the
generated screens were pinned against.

## Evaluation

`instanceMatchesFilter(instance, node)` is the one in-memory matcher over
the screen instance shape. `eq` compares stringified values; `in` tests
membership; `contains` lowercases both sides. Lineage addresses compare the
ref id (`{ id }` objects and raw scalars both occur in pools).
`countPredicates(node)` counts the predicates in a tree — the condition
count a collection surface badges its view control with.

## Builder edit model

`builder.js` owns the user-facing projection of the tree: one combinator
(`and`/`or`) over predicate rows with per-row negation — the surface
AND/OR/NOT is made of. `filterFromBuilderRows(rows, combinator)` composes
rows into the canonical tree (incomplete rows drop; negated rows wrap
`not`); `builderRowsFromFilter(filter)` decomposes exactly the trees the
builder emits — a bare predicate is one row with the default combinator —
and refuses foreign shapes (nested groups) with `null` instead of
corrupting them.

## Server projection

The Mongo translation is engine-specific and lives server-side in
[server/features/instances/filters.js](../../server/features/instances/filters.js):
`and` merges into one query object (flat maps cannot collide keys), `or`
and `not` project to `$or`/`$nor`, `contains` to an escaped case-insensitive
regex, and lineage/`_id` equality matches both stored id forms through the
flexible-id helper — the same semantics the transport had before the tree
existed.

## Consumption

- Server transport: [server/features/instances](../../server/features/instances/README.md)
  normalizes the wire map through `filterFromFlatFilters` with the declared
  lineage gate, then projects to Mongo.
- Screen composition: [shared/ui-mapping/screen.js](../ui-mapping/screen.js)
  resolves `$screen.*` placeholders against the routed scope (a screen
  concern, kept there) and evaluates the normalized tree over the pool.
- Collection toolbar: `instanceMatchesToolbar` in
  [shared/ui-mapping](../ui-mapping/README.md) composes an `or` of
  `contains` over the search keys plus the id, and `eq` conjunctions over
  facet selections, then evaluates the same matcher.
- Filter builder: `components/shared/FilterBuilder.vue` edits the tree
  itself (combinator + negated predicate rows through `builder.js`) and
  hands the composed tree to its host; the builder never evaluates.

## Validation

`npx vitest run shared/instance-filters` — table-driven coverage of the
normalization rules (drop, collapse, gate), every operator and address, and
the composition semantics the three consumers pin.

## Related

- [shared/README.md](../README.md) — shared contracts inventory.
- [shared/ui-mapping/README.md](../ui-mapping/README.md) — the list-controls
  contract whose search/facet state feeds the toolbar composition.
