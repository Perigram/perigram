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
//
// Kinds (M7): a surface entry is an `editor` (the default — mounts over
// `{ record, persistence }` inside the editor chrome) or a `preview`
// (mounts read-only in the platform's preview slots — the card preview
// band and the detail previewSource group — over `{ record, payload }`:
// the host resolves and parses the payload document, so a preview module
// never fetches, persists, or queries; it always targets contract 1).
// The listing contract validates the kind and its bindings (SDK
// `parseListing`); the platform serves resolved preview bindings on the
// type view.
export const SUPPORTED_SURFACE_CONTRACTS = [1, 2];

export function isSupportedSurfaceContract(version) {
  return SUPPORTED_SURFACE_CONTRACTS.includes(Number(version));
}

// Where a plugin's surface modules load from: the install's first
// configured endpoint origin — the executor serves its UI beside its
// services. Server-side consumers only: that origin addresses the
// server's network (dev's docker-internal executor host is the canonical
// example), which a browser can never reach, so the platform serves
// modules same-origin through `pluginModuleUrl`'s app proxy route.
export function endpointOriginOf(install) {
  for (const url of Object.values(install?.endpoints || {})) {
    try {
      return new URL(String(url)).origin;
    } catch {
      continue;
    }
  }
  return null;
}

// The browser-facing module URL: the app's plugin-module proxy path
// (`GET /api/plugins/:pluginId/module**` — the plugins feature streams it
// from the endpoint origin server-side). `null` until an endpoint is
// connected; the client loader renders the connect-the-executor state
// then.
export function pluginModuleUrl(install, modulePath) {
  return endpointOriginOf(install)
    ? `/api/plugins/${encodeURIComponent(install.pluginId)}/module${modulePath}`
    : null;
}
