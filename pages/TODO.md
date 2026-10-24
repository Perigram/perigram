# TODO

## pages deslop delta (2026-10-24 audit)

### README

- [x] pages/README.md → rewrite the route inventory to the live families; `ls pages/` = auth, chats.vue, index.vue, invitation, organization, screens, terms-and-conditions.vue, test. Delete six dead route families with their prose:
  - `/assets` L159-175 (asset child routes, `MetricPanel` rail, tabs law) and L226-232 (v24 DTOs, pen-template screens, cassette manager) — no `pages/assets/` exists; pen templates live in stores for the tech-drawing editor surface, and L227-228's "legacy flat `name`/`stroke` compatibility" clause dies with the section.
  - `/catalog` and `/requisitions` L177-182 — no such routes.
  - `/geometry-captures` L184-191 — the directory does not exist.
  - `/project/[slug]` L193-200 — no project pages and no `/projects` route.
  - L163-167 "current production uses include project workspace rows, project detail facts, and selected warehouse inventory context" — `utils/app-instance-surfaces.js` exports `{ fieldGroups: {}, surfaces: {} }` (empty); seam decision tracked in [shared/TODO.md](../shared/TODO.md).
- [x] pages/README.md → L285-288 "UI cleanup classifies components by route reachability…" meta-process paragraph; delete.
- [x] pages/README.md → L107-113 restates the `statePolicyByType`/`stateTransitionsByType` derivation; canonical home is [shared/ui-mapping](../shared/ui-mapping/README.md) (already linked there) — keep the link, drop the restatement.
- [x] pages/README.md → restate as positive contracts: L16-19 (entry ladder fallback law), L94 ("never dead-ends" → every key resolves to the home screen), L210 (raw request paths and server error strings stay out of invitation copy), L221-222 (register submits credentials only), L247-248 (account concerns live in the account settings popup); L84 "continue to use" → state the `layout: 'app'` + `middleware: 'auth'` contract once.
- [x] pages/organization/README.md → L195-197 legacy role/user layout-node story → state the persistence contract: only `CANVAS_PERSISTENT_NODE_TYPES` persist (packages/processes/src/transpiler.js:56 `definitionToCanvas`), entity/service/socket nodes reconstruct from process records.
- [x] pages/organization/README.md → compress absent-thing enumerations: L136-140 (server does not lower v5 records…), L150-156 (palette has no raw-id lookup, producer-path join, fixed-arity list constructor, packet matching control, transport adapter item) — the positive palette inventory already exists beside them; keep at most one absence clause. L171-172 "registry types are never palette entries" duplicates the drop-the-unbound-construct rule at L168-171. L232-233 "must not hardcode" → state the derivation (defaults come from the domain entity registry).
- [x] pages/organization/README.md → L283 "(crystallization Phase 4)" session-phase label; delete the parenthetical.
- [x] pages/test/README.md → L5-6 "`/admin` now owns the consolidated entity-centric development surface" + "compatibility routes" — no `/admin` route exists anywhere (pages listing; nuxt.config route hooks = 0 matches); state the two pages as the internal demo surfaces.
- [x] pages/test/README.md → L72-74 "the authored render vocabulary overriding shape inference: declared sort keys, authored list layouts (including deliberately contradictory ones)" — both override channels are gone (shared/ui-mapping/index.js:256 authored list-layout override channel removed; :507 authored default-sort override replaced by derivation); delete the bullet.
- [x] pages/test/README.md → L24 "seeds the entity store" → it seeds the instances store (ui-lab.vue:310 `useInstancesStore`, :381 `upsertRecord`); trim the L15-22 demo bullets to the non-obvious facts (feedback persistence key `perigram:ui-lab-feedback:v1`); the "data-model review" bullet rides the nonexistent `/api/debug/data-models` route (area-2: no route file; no reference in ui-lab.vue) — delete the bullet.

### Code findings (truth pass 2026-10-24)

- [ ] pages/test/ui-mapping.vue:12-18 — dead source-toggle Button (no `source` binding, no click handler).
- [ ] pages/screens/[screenKey].vue:65 — comment claims titled list screens keep the route title strip while its own `pageTitle` nulls for typeList (since 3e024aaf8): possible unintended loss of the list-screen title/back control — owner decision.

### Owner decisions wanted

- None.

- [ ] WAITING — owner verification: read pages/README.md route-map
  rewrite (6 dead route families gone; /profile vs /organization resolved
  to SPEC) + the organization/test README trims.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). Route-map rewritten to the
live `ls pages/` families; six dead route families gone; `/profile` vs
`/organization` contradiction resolved to SPEC; state-policy derivation
folded to the shared/ui-mapping link; positive-contract pass on the
entry-ladder/invitation/register clauses. organization/README:
layout-node persistence contract stated, absence enumerations compressed,
phase label dropped; test/README: `/admin` claim dead, override-channel
bullet dead, instances-store seeding stated. OPEN: none beyond
verification.
