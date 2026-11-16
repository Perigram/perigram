# TODO

## packages/cts/ deslop delta (2026-10-24 audit)

`SPEC.md` here is owner-written law; the SPEC revision is decided
(2026-10-25; task below). `TODO.md_archive` is shipped history — its
2026-09-24 hard-cut items landed (recursive state trees via
`compileTreeDeclarations`, species-only catalog, optional producer identity,
palette E2E); resurrect nothing from it.

### README

- [x] Fold the Modules section into a module map with SPEC pointers: entries currently restate SPEC contracts at length (registry.js L89-110, diff.js L52-82, domain-projection.js L111-140 are 20-40-line restatements; duplication clusters: identifier mint = SPEC §4 L186-201 over README L103-109; stored-shape slots = §3 L107-124 over L113-119; migration steps = §11 L549-559 over L60-72; base-domain passthrough = §19 L830-834 over L134-139; lineage recursion = §6 L301-307 over L35-38). Collapse each entry to file + one-line role + SPEC § pointer; L8-9 already promises exactly this mapping.
- [x] Delete the `compat/domain-cnc.js` module entry (L173-175): the file does not exist (`ls packages/cts/src/compat/` — domain-projection, field-schema-rows, graph-protocol, process-checks, process-grammar only).
- [x] Delete the `pages/organization/types.vue` passage (L227-230): root TODO.md L5423-5427 records the page already gone with its references purged; `ls pages/organization/` has no types.vue; the registry browser concern lives in the designer tree.
- [x] Document the missing module entries: `compat/process-grammar.js` (CTS ⇄ `PROCESS_BASE_TYPES` seam adapter; consumed by processes/src/designer.js and node-catalog.js) and `pack/framework.js` (`frameworkTypes`, exported from src/index.js).
- [x] Strip migration-era residue: L96-101 ("legacy persisted docs and older pack fixtures", "adopts the retired `render` facet"), L196-197 ("the v4 twin table is gone with the retired kinds"), L209-210 ("there is no v4 rewrite at any seam"), L240-241 ("the retired source-flip converter has no runtime path") — the SPEC owns migration semantics.
- [x] Fix the L220 citation: "browser-safe by contract (SPEC §13)" — §13 carries no browser-safety clause (grep "browser" in SPEC.md → only §21 L1024, about pack declaration data); cite §21 or drop the section number.

### Code deslop

- [x] Contract-shaped comments (docs-guard homing backlog, `node scripts/check-docs.js`): `src/compat/graph-protocol.js` (343 chars), `src/registry.js` (563), `src/compat/process-grammar.js:1-4`, `src/compat/field-schema-rows.js:1-4` (grammar/seam contracts), `src/render.js:17` — move the semantics into the owning README section (SPEC § pointers), leave one-line comments.
  Landed 2026-10-25: all five homed — registry.js entry gains the SPEC §11
  free-redefinition law (zero live instances, repair of a broken stored
  declaration); field-schema-rows entry states the flat `fields.*`
  minting law (SPEC §13); process-grammar/render/graph-protocol
  semantics already lived in their entries, code now carries one-line
  SPEC §/README pointers; the package's check-docs homing entries clear.

### SPEC revision (decided 2026-10-25)

- [x] Revise `SPEC.md`: §3 stands as the wire law (the §21 L1062-1066
  block-vocabulary sentence dies); history sections out (§15 migration
  table, §19 tier-status narration, §14 dev-loop narration with its
  authoring-loop facts folded into §20, §21 "Historically the pack mount
  provided:" block and "(§8, landed)" tags); §7↔§20 state-socket law and
  §7↔§10 fieldPolicy narrowing dedup to one home each; §13 code-homes
  corrected (grammar+validator home is packages/cts, R1-R6 run in cts
  `registry.compile()`, the declaration ⇄ process-grammar translator is
  `compat/process-grammar.js`, the types.vue reference dies); "audit
  correction" labels deleted (§2 L89, §8 L464, §18 L782); §7 gains the
  declared-state-deadline law; renumber per the audit TOC (decided item
  below) with the citation sweep.
  Landed 2026-10-25 (old→new): 1-13 keep their numbers (retitled per the
  TOC); 14 dev-loop and 15 migration table die; 16+17 worked examples →
  17; 18 expressions → 15; 19 build order dies (its synthesis-only
  projection law folds into §13); 20 graph protocol → 14 (authoring-loop
  fold lands there as a subsection; `PROCESS_PROTOCOL_VERSION` is the
  version of record); 21 plug-ins → 16 (historical pack block, landed
  tags, and the instance-wire sentence cut). §7 homes the state-socket
  law, fieldPolicy, and the deadline law; §10 and the §14 references
  bullet link to it. The §19 seam-translator fact homes in §13's table.
  Citation sweep: 27 `CTS SPEC §` + in-package self-citations renumbered
  across processes/workflows/core/plugin-sdk/shared/ui-mapping/
  composables/utils/stores/pages/server features+api+core+scripts/specs;
  dead-section citations repointed (CTS §19 projection → §13; abandoned
  data → root SPEC §Legacy policy §15). Code comments citing old §N
  stay with the open contract-comment homing task.

### Owner decisions wanted

- [x] §21 L1062-1066 states instance documents project a block-vocabulary wire DTO (`identity`/`status`/`data`/`specs`); §3 L129-137 (owner decision 2026-10-11, later) states the wire DTO **is** the stored §3 shape with no `identity` block, and the code follows §3 (server/features/instances/service.js synthesizes no such blocks — grep identity/specs absent) — confirm §3 stands as the wire law and the §21 sentence dies in the next SPEC revision.
  decided 2026-10-25: §3 stands; the §21 sentence dies in the SPEC revision task.
- [x] Strangler-era history sections: §15 "Existing constructs → CTS" (a migration table whose every row landed or was deleted), §19 "Build order" tier-status narration ("landed, then the cut"), §14 "Process designer in development" (dev-loop narration overlapping §20/§21), §21 "Historically the pack mount provided:" block and "(§8, landed)" status tags — proposal: history content moves to TODO/archives, §14's authoring-loop facts fold into §20, §21 keeps current plugin law (marketplace cross-ref L997-999).
  decided 2026-10-25: history sections out — SPEC revision task.
- [x] Internal duplication: §7 L366-381 vs §20 L917-922 (state-socket authoring law stated twice); §7 L404-412 vs §10 L533-539 (fieldPolicy narrowing stated twice) — one home each.
  decided 2026-10-25: one home each — SPEC revision task.
- [x] §13 code-homes drift: L599 names `packages/core` as grammar+validator home (the grammar lives in `packages/cts`: values/rows/units/expressions; core carries block DTOs); L601 names `packages/processes` as the R1-R7 compiler home (R1-R6 run in cts `registry.compile()`; processes owns graph validation); §19 L852 names `compat/field-schema-rows.js` as the seam translator (the declaration ⇄ process-grammar translator is `compat/process-grammar.js`); §19 L837 references the deleted types.vue.
  decided 2026-10-25: code-homes fixed — SPEC revision task.
- [x] Section numbering: renumbering (audit TOC proposal: 1 Scope · 2 Value universe · 3 Stored shape & wire · 4 Declarations · 5 Classes · 6 Edges · 7 States & typed-operation authoring (guards, fieldPolicy, actors, deadlines) · 8 Operators · 9 Aggregates · 10 Policy · 11 Evolution · 12 Static rules R1-R7 · 13 Storage mapping · 14 Graph protocol · 15 Expressions · 16 Plug-ins · 17 Worked examples) breaks citations: 27 `CTS SPEC §` citations across 15 files (workflows, processes, shared, ui-mapping, composables, utils, stores, server features, root SPEC/TODO) plus in-package `SPEC §N` self-citations — renumber only with a citation sweep.
  decided 2026-10-25: renumber per the audit TOC with the citation sweep — SPEC revision task.
- [x] "audit correction" labels at §2 L89, §8 L464, §18 L782: the content is law, the label is session residue — delete the labels.
  decided 2026-10-25: labels deleted — SPEC revision task.
- [x] Declared-state-deadline law for §7 — decision item lives in [packages/processes/TODO.md](../processes/TODO.md) (workflows/processes citations repoint, or §7 gains the law).
  decided 2026-10-25: §7 gains the declaration law; workflows/processes citations point there (SPEC revision task).

- [ ] WAITING — owner verification: read README.md folded to a module map
  with SPEC pointers (246→148); domain-cnc + types.vue entries dead,
  process-grammar + pack/framework documented; SPEC.md renumbered §1–§17
  per the audit TOC with the decided revision package landed (wire law,
  history out, dedups, code homes, deadline law, protocol naming).

### Identifier law (owner direction 2026-10-29)

- [ ] WAITING — owner verification: the identifier flag is authored —
  zero or two flagged fields is a compile error through the standard
  channel (write gate refuses, reads stay served, records render the
  unnamed placeholder); the boundary mint is retired and the designer's
  empty dropdown pick leaves the flag unowned.

#### Agent Notes (2026-10-29)

Session `agent/authored-identifier-law-20261029` (worktree
`.agent-wt-idlaw-20261029`). SPEC §4 rewritten; the mint deleted from
`registry.js` `normalizeType` and the zero-flag error added to
`checkDisplayFacet`. `cassette-design` in the facade listing and the
cnc pack's `partyTypes`/`sheet`/`part`/`project`/`facade` gained their
authored flags; spec fixtures rebased. The designer dropdown's empty
option relabels Auto → Not set (`processDesigner.unset`). Side repairs,
all pre-existing drift on `local` from the cassette→cassette-design
rename (`2feb68cff`): `graph-protocol-construction.spec.js` rebound,
`test-data/persisted-acceptance.js` rebound (16→4 failures in the
process-definitions service specs; the 4 remaining are untouched
pre-existing drift). `components/shared/README.md` `UserChip` entry
corrected to `identifier: "name"` (framework.js is the authority).
Fixtures across `server/features/cts-types` and
`server/features/plugins` specs gained their authored flags. Full-suite
delta vs `local` baseline: 16 baseline failures repaired
(graph-protocol-construction, ui-contract, process-definitions service
family), zero new failures; the remaining failing server specs
(support, app-registry, plugins upgrades, process-definitions runtime)
are pre-existing baseline drift. `npx vitest run packages/cts` 98/98,
`packages/processes` 551/551, cts-types 23/23, plugins 60/60,
framework/design-system 39/39, SSR smoke 23/23, check-arch,
framework:validate, check-docs (one pre-existing broken link:
`workers/nesting/README.md` → `./jagua-rs/README.md`). E2E not run
(requires a running stack).

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025` executed the decided SPEC
revision: sections renumbered to the audit TOC and physically reordered
(Graph protocol §14 before Expressions §15, Plug-ins §16, Worked
examples §17); strangler-era sections deleted with the surviving law
re-homed (§19's synthesis-only projection paragraph and seam row → §13;
§14's authoring loop → §14 Graph protocol); §7 gained the
declared-state-deadline law and homes state-socket + fieldPolicy
authoring; §20's "(v5)" title and v4 collision prose resolved on
`PROCESS_PROTOCOL_VERSION` as the version of record; the §21 instance
wire sentence, historical pack block, landed tags, and audit-correction
labels cut; citation sweep landed across the tree. OPEN: code item
(contract-shaped comments).

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). README.md rewritten as a
module map (246→148): file + one-line role + SPEC § pointer per entry;
`compat/domain-cnc.js` and `pages/organization/types.vue` entries dead;
`compat/process-grammar.js` + `pack/framework.js` documented; migration
residue stripped; L220 citation fixed. OPEN: code item + 7 owner
decisions.

### Agent Notes (2026-10-25)

Session `agent/pkg-deslop2-20261025` (worktree `.agent-worktrees/pkg`).
Code deslop item landed: the five contract-comment sites homed to the
README Modules entries with one-line SPEC §/README pointers left in
code; the field-schema-rows header's stale §15/§19 citations and
provenance line went with it. check-docs: the package's homing entries
clear (repo debt 26→17); the remaining blocking broken link
(`workers/nesting/README.md` → `./jagua-rs/README.md`) is pre-existing
and outside this wave. `npx vitest run packages/cts` green.


### Agent Notes (2026-11-16, typed traversal)

Added compiled-view type resolution for nested `related`, ref-field,
`children`, and `descendants` traversal inside boolean predicates.
Quantifier bindings inherit the declared target types, so nested field
paths are checked against the traversed declaration. Runtime collection
reads remain supplied by the authorization-scoped resolver boundary.
Focused coverage includes nested ref traversal, containment, and an
undeclared relation key. Permanent declaration and write enforcement,
plus concurrency guarantees, remain open below. The compiled checker now
rejects non-boolean predicates/quantifier bodies and invalid aggregate value
types before the declaration is accepted.

### Generalized constraint expression substrate (2026-11-16)

- [x] Add finite `exists`/`all`/`none`/`one` quantifiers and
  `count`/`sum`/`min`/`max` aggregates to the declarative expression
  evaluator, including deterministic empty-collection semantics.
- [x] Add explicit authorized collection-resolver hooks for related,
  children, and descendants traversal; cap collection cardinality and
  evaluation steps.
- [x] Extend the shared boolean AST checker for nested bound variables and
  quantifier bodies while keeping map/filter comprehensions out of boolean
  guard vocabulary.
- [x] Add statically typed relation/containment resolution against compiled
  declarations, including nested field paths, predicate result types,
  quantifier bodies, and numeric/quantity aggregate bodies.
- [x] Add authored instance-scoped constraints to declarations and
  compile their boolean expressions against the composed typed view.
- [x] Add asynchronous bounded evaluation for server-backed relation and
  containment resolvers.
- [ ] Enforce constraints at every authoritative create/update/import/
  transition boundary.
- [ ] Add concurrency-safe unique/cardinality/aggregate enforcement using
  transactions, unique indexes, or conditional/serialized writes. The AST
  evaluator alone is not an enforcement guarantee.
