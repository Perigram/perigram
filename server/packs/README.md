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
a per-surface import.

- `tech-drawing/` — mounted purely by composition (no service bindings):
  the `pen-template` and `layer-standard` reference types and their
  system-catalog instances ride the generic instance machinery.
  Declaration data lives in `packages/tech-drawing/src/index.js`.
- `facade/` — the facade pack: cassette (OCCS file + cassette-designer editor),
  sheet design, the declared sheet-material type, the nesting value
  services (`nesting.solve`, `nesting.items`, `orders.readRows`,
  `cassettes.resolveByName` → their command handlers in the pack's
  `nesting/`, `orders/`, and `cassettes/` modules), and the
  `cassette-design` production type whose `upload`/`bake`/`convertDxf`
  construction handlers produce per-piece records with extractable
  geometry. The pack is the implementation home, not a binding manifest:
  `cassettes/`, `orders/`, and `nesting/` live inside this module with
  their repositories, services, and specs — removing the pack removes the
  domain's code, not just its registry mounts. The core framework imports
  none of it: `artifact-conversions` and `generateAttachment` receive
  their facade executors as pack-registered handler overrides, and
  support's type lists resolve through the registry. Declaration data
  lives in `packages/facade/src/pack.js`; the pack requires
  `tech-drawing` and `documents` (pen/layer references and the order
  table types resolve through the composed view, never by importing
  them). The composed order process — the pack's end-to-end proof flow —
  lives in `order-process-fixture.js` with its spec.

## Related

- [server/runtime/README.md](../runtime/README.md) — the framework registry and mounting.
- [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §21 — the pack contract.
