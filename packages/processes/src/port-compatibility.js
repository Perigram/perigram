import { portSpecsCompatible } from './ports.js';

export const PROCESS_PORT_COMPATIBILITY_PROFILE = 'perigram.cts';

// CTS retains its domain-specific compatibility law, but the graph editor
// invokes it through the plugin-SDK's provider-owned compatibility registry.
export function registerProcessPortCompatibilityProfile(registry) {
  if (!registry || typeof registry.register !== 'function') {
    throw new TypeError('A shared graph port compatibility registry is required');
  }
  return registry.register(PROCESS_PORT_COMPATIBILITY_PROFILE, (source, target) => {
    const result = portSpecsCompatible(source, target);
    return {
      status: result.ok ? 'exact' : 'incompatible',
      compatible: result.ok,
      reason: result.reason || (result.ok ? 'CTS process port contracts match' : 'CTS process port contracts do not match'),
      conversions: []
    };
  });
}
