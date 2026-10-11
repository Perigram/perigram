// Plugin-delivered editor surfaces (SPEC §Plugin marketplace, owner
// decision 2026-10-11): the surface-contract versions this platform can
// mount. The server install/upgrade gates refuse listings whose surfaces
// target an unsupported version; the client loader re-checks before
// importing a module — a refusal always happens at the gate, never as a
// half-mount. Bump by adding a version and teaching the loader its mount
// context; never by editing what an existing version means.
export const SUPPORTED_SURFACE_CONTRACTS = [1];

export function isSupportedSurfaceContract(version) {
  return SUPPORTED_SURFACE_CONTRACTS.includes(Number(version));
}
