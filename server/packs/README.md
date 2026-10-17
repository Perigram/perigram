# COMPONENT: Packs

No pack remains mounted: documents and tech-drawing retired into their
plugins (owner decision 2026-10-17, SPEC §Plugin marketplace) — their
types install per organization from the listings
([workers/documents](../../workers/documents/README.md),
[workers/tech-drawing](../../workers/tech-drawing/README.md)), their
editors ship as the plugins' surface modules, and their compute runs in
the external executors. The composition seams below stay until their
consumers finish migrating off them (slice G of the unified-space plan).

A pack module exports
one mountable unit — declaration data (types, editors, services; browser
safe) plus a server binding (entity services with process bindings,
construction handlers, commands, task executors, workflow hook handlers,
domain content). The framework registry (`server/runtime/app-registry.js`)
imports packs only; removing a pack removes its content from the running
app.

Pack composition (`declarations.js`) is declaration-only: the ordered
mounted-pack list with `requires` metadata, topologically sorted with
loud errors for missing requirements and inter-pack id collisions.
`cts-types` and the instance services compose the system view through it;
service bindings stay in the mount modules. Beside the type/editor
composition, `composePackServices()` flattens every mounted pack's
`services` list — the one service list the process runtime's projected
domain, the admin domain route, and the designer resolve their
`packServices` from, so a pack registration reaches every surface without
a per-surface import. The same law serves attachment kinds and domain
slices: `composePackAttachmentKinds()` (payload upload contracts for the
type view) and `composePackDomains()` (operator contracts, block
vocabulary, and UI metadata for the projected-domain seam), and starter
constructs: `composeStarterConstructs()` (the constructs packs station
into every organization's initial process — SPEC §UI
visible-by-default; duplicate stationing across packs is a mount
error) — framework
code composes the mounted packs and never imports a pack symbol.

Type declarations may carry `projections` (SPEC §8 `p extract`, declared
next to their type): `{ id, label, output, resolve }` where `resolve` is
either a stored `field` path (the projection is a pure row read — no
handler) or a `handler` id bound by a pack mount's `projectionHandlers`.
Projection handlers are entity reads — that is the projection's job — and
live in `server/packs/<pack>/projections/`.

Value-service handlers (SPEC §8 s-species) are pure V→V: they never
import instance or file services — dereferencing is a projection's job
(see the purity rule in
[packages/cts/SPEC.md](../../packages/cts/SPEC.md) §8). They live in
`server/packs/<pack>/value-services/`, and two architecture guards hold
the line: service input signatures with `ref` fields are rejected at the
declaration, and `value-services/` modules importing the instance or
files features are rejected at the mount (see
[scripts/README.md](../../scripts/README.md)).


No framework code imports any of the plugins' domains.

## Related

- [server/runtime/README.md](../runtime/README.md) — the framework registry and mounting.
- [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §21 — the pack contract.
