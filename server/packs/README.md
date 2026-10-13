# COMPONENT: Packs

Optional domain plug-ins mounted by the framework registry (CTS SPEC §21:
[packages/cts/SPEC.md](../../packages/cts/SPEC.md)). A pack module exports
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
vocabulary, and UI metadata for the projected-domain seam) — framework
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

- `documents/` — the pack mount binding the `rows` projection handler
  (`documents.tableRows`, see
  [@perigram/documents](../../packages/documents/README.md)) and the
  `documents.csvText` value-service command (rows → CSV text); the types
  ride the generic instance machinery, whose `content` creation protocol
  serves their graph-authored creates.
- `tech-drawing/` — mounted purely by composition (no service bindings):
  the `pen-template` and `layer-standard` reference types and their
  system-catalog instances ride the generic instance machinery.
  Declaration data lives in `packages/tech-drawing/src/index.js`.

The facade domain is NOT a mounted pack: it installs per organization as
the facade plugin (SPEC §Plugin marketplace) — its declarations arrive
with the install snapshot ([workers/facade listing](../../workers/facade/README.md)),
its construction/conversion/export compute runs in the external facade
executor, and the generic instance machinery serves its records
end to end. No framework code imports it.

## Related

- [server/runtime/README.md](../runtime/README.md) — the framework registry and mounting.
- [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §21 — the pack contract.
