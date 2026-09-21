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
service bindings stay in the mount modules.

- `tech-drawing/` — mounted purely by composition (no service bindings):
  the `pen-template` and `layer-standard` reference types and their
  system-catalog instances ride the generic instance machinery.
  Declaration data lives in `packages/tech-drawing/src/index.js`.
- `cnc/` — the CNC pack: cassette (OCCS file + cassette-designer editor),
  sheet design, facade design file types, the nesting solver service, the
  nesting-run transition hooks, and the transitional legacy `queue` entity
  service (the queue production flow's hook effects resolve it from the
  registry; deleted with that flow). Declaration data lives in
  `packages/domain-cnc/src/pack.js`; the pack requires `tech-drawing`
  (pen/layer references resolve through the composed view, never by
  importing it).

## Related

- [server/runtime/README.md](../runtime/README.md) — the framework registry and mounting.
- [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §21 — the pack contract.
