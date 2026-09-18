# COMPONENT: Packs

Optional domain plug-ins mounted by the framework registry (CTS SPEC §21:
[packages/cts/SPEC.md](../../packages/cts/SPEC.md)). A pack module exports
one mountable unit — declaration data (types, editors, services; browser
safe) plus a server binding (entity services, commands, task executors,
domain content). The framework registry (`server/runtime/app-registry.js`)
imports packs only; removing a pack removes its content from the running
app.

- `cnc/` — the CNC pack: cassette (OCCS file + cassette-designer editor),
  sheet design, facade design file types, the nesting solver service, and
  the transitional legacy entity services pending deletion. Declaration
  data lives in `packages/domain-cnc/src/pack.js`.

## Related

- [server/runtime/README.md](../runtime/README.md) — the framework registry and mounting.
- [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §21 — the pack contract.
