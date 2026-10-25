# TODO

## packages/processes/ deslop delta (2026-10-24 audit)

### README

- [x] Rewrite `README.md` (1452 lines under 4 headings; L120-1452 is one 1330-line undifferentiated wall under "## Headless definition authoring") into the headed contract sections of [SPEC.md](./SPEC.md) — the SPEC section list is the target table of contents: Authoring seam · Designer round trip · Palette · Compiler and validation seams · Workflow synthesis · Producer outputs and lineage · Screens and inference · Access and roles · Runtime orchestration · Catalog and protocol · Dataflow semantics · Persisted-data rewrites — with tables for rule lists. Every spot-checked fact in the wall verified against source; the rewrite is form, so carry the facts.
- [x] Strip the migration-era residue (~35 sentences; representative): L91-93 (stored graphs carrying comparison ops on `value.logic` before the split), L338-339 ("no v4 → v5 species rewrite at any seam"), L505-506 (starter templates removed with producer panel editors), L789 ("the v5 construct surface never renders block sockets"), L872-883 (paragraph enumerating retired v4 kinds), L988-990 ("former raw `region`, `path`, `metadata`, `lifecycle` json sockets"), L1450-1452 ("replaces stale stored command-input copies such as the former inert `pdfTemplateId`").
- [x] Keep one worked example per rule: L734-772 (queue/cassette/artifact examples inside compiler rules), L1192-1194, L1329-1343 (screen-inference examples) — one canonical example each, the rest is narration.
- [x] Replace restated law with SPEC links: palette law ↔ cts SPEC §8 L479-497 (README L50-102); readable principals ↔ cts SPEC §13 L616-629 (L104-118); transition-guard ownership ↔ cts SPEC §7 L383-394 (L431-438); parent-is-leaf ↔ cts SPEC §7 L365-367 (L425-427); missing-field contract ↔ cts SPEC §18.2 L782-787 (L1109-1125) — keep only this package's designer/runtime specifics.
- [x] Delete the stale script reference L1243-1246: `server/scripts/migrate-process-command-output-statuses.js` does not exist (`ls server/scripts/`).
- [x] Delete or restore the stale script reference L1399-1408: `server/scripts/sweep-redundant-screens.js` does not exist (`ls server/scripts/`); the detection API itself (`redundantAuthoredScreens`/`detectRedundantScreens`) exists in compiler-core.js and stays documented.

### Code deslop

- [x] Contract-shaped comments (docs-guard homing backlog, `node scripts/check-docs.js`): `src/authoring.js` (352 chars), `src/compiler-core.js` (3 entries), `src/node-catalog.js` (252), `src/transpiler.js` (521), `src/ui-contract-projection.js` (289), `src/missing-field.js:6-14` (restates README L1109-1125) — move the semantics into the owning README section the rewrite creates, leave one-line pointers.
  Landed 2026-10-25: all seven homed — vocabulary-gap survival
  (Authoring seam), emptiness-rule extension for entity/block and
  enum/status values (Required inputs), `resolveConstructionMode`
  precedence law (Construction contracts), idempotence clause (Designer
  round trip), spread-projection law (Effective manifests),
  missing-field header → pointer; one-line README pointers left in code;
  the package's check-docs homing entries clear.
- [x] Protocol naming pass: the persisted integer `PROCESS_PROTOCOL_VERSION` (src/types.js:1) is the version of record; resolve the v4/v5 collision (cts SPEC §20's "(v5)" title, the pre-species "retired v4 kinds" vocabulary) (decided 2026-10-25).
  Done 2026-10-25 in the cts SPEC revision: the Graph protocol section (§14 after renumbering) carries a bare title, names `PROCESS_PROTOCOL_VERSION` the persisted version of record, and speaks the retired vocabulary as the retired executable kinds.

### Owner decisions wanted

- [x] Declared-state-deadline law home: `packages/workflows/README.md` L133-134 cites "CTS SPEC §7" for state deadlines; §7 states no deadline contract (only §3 L121 calls `stateChangedAt` "the deadline clock (§7)"); the runtime contract lives in [server/core/machines/README.md](../../server/core/machines/README.md) L39-54. Add the declaration law to cts SPEC §7, or repoint the citations to the runtime home.
  decided 2026-10-25: cts SPEC §7 gains the declaration law; workflows/processes citations point there (SPEC revision task in packages/cts/TODO.md).
- [x] Protocol version naming: cts SPEC §20 is titled "(v5)" while `PROCESS_PROTOCOL_VERSION = 4` (src/types.js:1) is the persisted `dataflowVersion`, and "retired v4 kinds" names the pre-species vocabulary — the triple use of v4/v5 collides; one naming pass.
  decided 2026-10-25: one naming pass; the persisted integer is the version of record — work item above.
- [x] Missing-field marker canonical home (audit duplication cluster 10): cts SPEC §18.2 or this package's README — pick one; the other links.
  decided 2026-10-25: cts SPEC §18.2 is the home; this README links.

- [ ] WAITING — owner verification: read README.md restructured to the
  SPEC 12-section skeleton (1452→1359); migration residue + both dead
  script refs dropped, restated law folded to cts SPEC links.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). README.md rewritten to the
SPEC TOC (1452→1359): migration-era residue + the two dead script refs
(`migrate-process-command-output-statuses.js`, `sweep-redundant-screens.js`)
dropped; palette/principals/guard/parent-is-leaf/missing-field law folded
to cts SPEC links; one worked example kept per rule. OPEN: contract-comment
homing (code) + the 3 decisions below.

### Agent Notes (2026-10-25)

Session `agent/pkg-deslop2-20261025` (worktree `.agent-worktrees/pkg`).
Code deslop item landed: the seven contract-comment sites homed to the
owning README sections named in the landing note, one-line pointers left
in code. check-docs: the package's homing entries clear (repo debt
26→17); pre-existing blocking broken link
`workers/nesting/README.md` → `./jagua-rs/README.md` stays outside this
wave. `npx vitest run packages/processes` green.
