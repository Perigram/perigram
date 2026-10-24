# TODO

## packages/cts/ deslop delta (2026-10-24 audit)

`SPEC.md` here is owner-written law; every SPEC item below is a revision
proposal awaiting owner action. `TODO.md_archive` is shipped history — its
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

- [ ] Contract-shaped comments (docs-guard homing backlog, `node scripts/check-docs.js`): `src/compat/graph-protocol.js` (343 chars), `src/registry.js` (563), `src/compat/process-grammar.js:1-4`, `src/compat/field-schema-rows.js:1-4` (grammar/seam contracts), `src/render.js:17` — move the semantics into the owning README section (SPEC § pointers), leave one-line comments.

### Owner decisions wanted

- [ ] §21 L1062-1066 states instance documents project a block-vocabulary wire DTO (`identity`/`status`/`data`/`specs`); §3 L129-137 (owner decision 2026-10-11, later) states the wire DTO **is** the stored §3 shape with no `identity` block, and the code follows §3 (server/features/instances/service.js synthesizes no such blocks — grep identity/specs absent) — confirm §3 stands as the wire law and the §21 sentence dies in the next SPEC revision.
- [ ] Strangler-era history sections: §15 "Existing constructs → CTS" (a migration table whose every row landed or was deleted), §19 "Build order" tier-status narration ("landed, then the cut"), §14 "Process designer in development" (dev-loop narration overlapping §20/§21), §21 "Historically the pack mount provided:" block and "(§8, landed)" status tags — proposal: history content moves to TODO/archives, §14's authoring-loop facts fold into §20, §21 keeps current plugin law (marketplace cross-ref L997-999).
- [ ] Internal duplication: §7 L366-381 vs §20 L917-922 (state-socket authoring law stated twice); §7 L404-412 vs §10 L533-539 (fieldPolicy narrowing stated twice) — one home each.
- [ ] §13 code-homes drift: L599 names `packages/core` as grammar+validator home (the grammar lives in `packages/cts`: values/rows/units/expressions; core carries block DTOs); L601 names `packages/processes` as the R1-R7 compiler home (R1-R6 run in cts `registry.compile()`; processes owns graph validation); §19 L852 names `compat/field-schema-rows.js` as the seam translator (the declaration ⇄ process-grammar translator is `compat/process-grammar.js`); §19 L837 references the deleted types.vue.
- [ ] Section numbering: renumbering (audit TOC proposal: 1 Scope · 2 Value universe · 3 Stored shape & wire · 4 Declarations · 5 Classes · 6 Edges · 7 States & typed-operation authoring (guards, fieldPolicy, actors, deadlines) · 8 Operators · 9 Aggregates · 10 Policy · 11 Evolution · 12 Static rules R1-R7 · 13 Storage mapping · 14 Graph protocol · 15 Expressions · 16 Plug-ins · 17 Worked examples) breaks citations: 27 `CTS SPEC §` citations across 15 files (workflows, processes, shared, ui-mapping, composables, utils, stores, server features, root SPEC/TODO) plus in-package `SPEC §N` self-citations — renumber only with a citation sweep.
- [ ] "audit correction" labels at §2 L89, §8 L464, §18 L782: the content is law, the label is session residue — delete the labels.
- [ ] Declared-state-deadline law for §7 — decision item lives in [packages/processes/TODO.md](../processes/TODO.md) (workflows/processes citations repoint, or §7 gains the law).

- [ ] WAITING — owner verification: read README.md folded to a module map
  with SPEC pointers (246→148); domain-cnc + types.vue entries dead,
  process-grammar + pack/framework documented.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). README.md rewritten as a
module map (246→148): file + one-line role + SPEC § pointer per entry;
`compat/domain-cnc.js` and `pages/organization/types.vue` entries dead;
`compat/process-grammar.js` + `pack/framework.js` documented; migration
residue stripped; L220 citation fixed. OPEN: code item + 7 owner
decisions.
