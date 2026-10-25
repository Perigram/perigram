# TODO

## server/features/support deslop delta (2026-10-24 audit)

### README

- [x] L441-444 → delete the stale loader paragraph ("loaders registered for cassettes, sheet designs… empty option list"): `INSTANCE_OPTION_LOADERS` registers `artifact` + `user` only (service.js:40-55) and every other type resolves through `processList` (service.js:63-68) — the paragraph contradicts this README's own L168-177; L172 fix: loader types are artifact + user.
- [x] L121-149 → MessageAttachments masonry/layout narration (two columns, column-major fill, bottom corner) moves to components/shared/README.md (the linked home of MessageAttachments); this README keeps the render channels and chip anatomy links.
- [x] L375-378 → delete the legacy-transcripts migration paragraph (completed migration; server/scripts/README.md owns script inventories).
- [x] L4-5, L59 stated affirmatively (capability module over `supportMessages`; directory discovery is display-name-only); L313-315 keeps the `bucket` wire field, drops the pre-migration framing; L20-32 field inventory tabulated (persisted / server-authored / stripped).

### Code deslop

- [x] service.js:41-52 → both concrete loaders synthesize a `name` alias from `identity.name` at the option boundary (`{...dto, name: dto.identity.name}`, twice); options carry the stored shape and consumers read `identity.name` (root SPEC deslop law 3 — the wire carries exactly what the domain stores).
  Landed 2026-10-25: alias synthesis deleted; loaders return the feature service promise. Consumers read the stored name slot per wire family (`identity.name` for v24 entity DTOs, root `name` for flat §3 instance DTOs): `instanceName`, `normalizeInstanceOption`, `compactInstanceSnapshot`. Support specs green (47).

### Owner decisions wanted

- [ ] None open for this folder.

- [ ] WAITING — owner verification: read README.md rewrite (450→428);
  loader paragraph corrected to code, masonry narration moved to
  components/shared, legacy-transcripts paragraph dead, field inventory
  tabulated.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). README.md rewrite executed
(450→428): loader paragraph corrected to code (`INSTANCE_OPTION_LOADERS` =
artifact + user), MessageAttachments masonry narration moved to
components/shared/README.md, legacy-transcripts paragraph dead, field
inventory tabulated. OPEN: loader `name`-alias code item.

### Agent Notes (2026-10-25, feat-deslop2 wave)

Session `agent/feat-deslop2-20261025-1521` (worktree
`.agent-worktrees/feat`). Loader `name`-alias deleted; the seam's
loader-shape comment died with the mapping. Consumers read the stored
name slot per wire family (generic §3 instances carry root `name`; v24
entity DTOs carry `identity.name` — both are the stored shape, no
synthesis).
