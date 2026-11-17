// Plugin-delivered editor surfaces (SPEC §Plugin marketplace, owner
// decision 2026-10-11): the surface-contract versions this platform can
// mount. The server install/upgrade gates refuse listings whose surfaces
// target an unsupported version; the client loader re-checks before
// importing a module — a refusal always happens at the gate, never as a
// half-mount. Bump by adding a version and teaching the loader its mount
// context; never by editing what an existing version means.
//
// 1 — the M5 data-only mount: ctx `{ vue, components, locale,
//     renderMarkdown }` (the host's markdown read pipeline — mermaid
//     fences render as pele diagrams through it; surfaces receive it,
//     never vendor marked/dompurify/pele), props
//     `{ record, persistence }` (createBlank/loadDocument/saveDocument/
//     rename). Every mount also passes the grant-keyed `mode` prop
//     ('edit' | 'read', SPEC §4) — a module that declares it degrades to
//     its read-only presentation under 'read'; one that does not keeps
//     its own degradation law over `access.canWrite`.
// 2 — the editor-grade mount (M6): everything in 1 plus the ctx
//     `queries` (cross-type instance reads), `records` (cross-type
//     create/update/delete), `notify` (host toast), and `access` (write-grant
//     resolution), the persistence `patch` transport, and the grown
//     primitive pack (designer chrome beside the PrimeVue primitives).
//     Author-facing shapes: docs/PLUGIN_AUTHORING.md §1a.
// 3 — the capability mount (owner decision 2026-10-17): everything in 2
//     plus `sync` and `upload`. `sync.onRecordChanged(callback)` delivers
//     the host's instance-change bridge events for the mounted record —
//     the same reconciliation channel the in-app editors ride (remote
//     saves and renames reload or flag; the surface's own publications
//     are skipped host-side) — and `upload.file(blob, { fileName })`
//     stores an asset through the host's file channel, returning the
//     stored file ref. Both are host-executed transports: the module
//     calls, never fetches.
// 4 — the navigation mount (owner decision 2026-10-19): everything in 3
//     plus `open`. `open.instance({ typeId, instanceId, editor })` asks
//     the host workspace to open a record as a tab (the workspace owns
//     tabs; a surface never navigates on its own).
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
export const SUPPORTED_SURFACE_CONTRACTS = [1, 2, 3, 4];

export function isSupportedSurfaceContract(version) {
  return SUPPORTED_SURFACE_CONTRACTS.includes(Number(version));
}

// Legacy external-integration origin resolution. Installed package assets
// are the primary module source; endpoint and surface origins remain a
// migration fallback for older installs.
export function endpointOriginOf(install) {
  if (install?.executorOrigin) {
    try { return new URL(String(install.executorOrigin)).origin; } catch { /* fall through */ }
  }
  for (const url of Object.values(install?.endpoints || {})) {
    try {
      return new URL(String(url)).origin;
    } catch {
      continue;
    }
  }
  if (install?.surfaceOrigin) {
    try {
      return new URL(String(install.surfaceOrigin)).origin;
    } catch {
      // fall through
    }
  }
  return null;
}

// The browser-facing module URL: the app's plugin-module proxy path
// (`GET /api/plugins/:pluginId/module**` — the plugins feature streams it
// from the endpoint origin server-side). `null` until an endpoint or
// surface origin is connected; the client loader renders the
// connect-the-executor state then.
export function pluginModuleUrl(install, modulePath) {
  const packageOwned = Number(install?.packageAssets?.count) > 0
    || Boolean(install?.declarations?.engine)
    || Boolean(install?.declarations?.runtimes?.length);
  return packageOwned || endpointOriginOf(install)
    ? `/api/plugins/${encodeURIComponent(install.pluginId)}/module${modulePath}`
    : null;
}
