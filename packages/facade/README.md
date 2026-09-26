# COMPONENT: @perigram/facade

The facade fabrication domain plug-in (SPEC §21). This is the pack that
owns cassettes (OCCS files with the cassette designer), sheet designs,
facade designs, the nesting solver service, and the pack's command and
event contracts. `server/packs/facade` binds the declarations to server
services; the framework registry and the client type system consume the
data.

The package was mislabeled `@perigram/domain-cnc` by an earlier agent
session; the legacy entity/workflow/construction tables that rode beside
these declarations are deleted. What remains here is the whole of the
facade domain in the type system.

## Modules

- `src/pack.js` — the browser-safe declaration data: `facadeFileTypes`
  (cassette, sheet-design, facade-design, facade-pattern — with declared
  states, transitions, render policies, and operators), `facadeEditors`
  (the canonical editor-binding contract served with the type view),
  `facadeServices` (the nesting solver's V→V registration, SPEC §8), and
  `facadeAttachmentKinds` (the OCCS upload kind).
- `src/commands.js` — the pack's command contracts:
  `saveCassetteTemplate`, `convertArtifact`, and `solveNestingValue`
  (the nesting service's command definition — its parameter sockets
  mirror the service signature one-to-one). Framework commands live in
  `server/core/commands/definitions.js`.
- `src/events.js` — the pack's trigger declarations (`facadeEvents`).
- `src/artifact-conversions.js` — the artifact conversion catalog
  (LAYOUT_DXF → DXF source → cassette).
- `src/index.js` — the public barrel plus `facadeDomain`: the server-side
  domain slice (commands, events, service identity table) the app
  registry mounts. Never an entity catalog — the CTS registry view is
  the catalog.

## The nesting service

`facadeServices` registers `nesting.solve` as a SPEC §8 s-species
operator: pure values in (typed job geometry and sheet parameters —
declared products per the value universe, never json-parked), values out
(layouts and a summary; the solver's raw layout payload is the one
true-external Json escape). The signature's field names match the
`solveNestingValue` handler's parameter sockets exactly, and the pack
mount binds the handler (`server/features/nesting/solve-value.js`)
beside it. See
[server/features/nesting/README.md](../../server/features/nesting/README.md)
for the boundary contract.

## Related

- [server/packs/README.md](../../server/packs/README.md) — pack mounting.
- [server/packs/facade/index.js](../../server/packs/facade/index.js) — the server binding.
- [packages/cts/SPEC.md](../cts/SPEC.md) — §8 operator species, §21 packs.
