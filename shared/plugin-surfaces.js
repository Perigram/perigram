// Plugin-delivered editor surfaces (SPEC §Plugin marketplace, owner
// decision 2026-10-11): the surface-contract versions this platform can
// mount. The server install/upgrade gates refuse listings whose surfaces
// target an unsupported version; the client loader re-checks before
// importing a module — a refusal always happens at the gate, never as a
// half-mount. Bump by adding a version and teaching the loader its mount
// context; never by editing what an existing version means.
//
// 1 — the M5 data-only mount: ctx `{ vue, components, locale }`, props
//     `{ record, persistence }` (createBlank/loadDocument/saveDocument/
//     rename).
// 2 — the editor-grade mount (M6): everything in 1 plus the ctx
//     `queries` (cross-type instance reads), `notify` (host toast), and
//     `access` (write-grant resolution), the persistence `patch`
//     transport, and the grown primitive pack (designer chrome beside
//     the PrimeVue primitives). Author-facing shapes:
//     docs/PLUGIN_AUTHORING.md §1a.
export const SUPPORTED_SURFACE_CONTRACTS = [1, 2];

export function isSupportedSurfaceContract(version) {
  return SUPPORTED_SURFACE_CONTRACTS.includes(Number(version));
}
