import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';

/**
 * Compatibility export for legacy imports. Workflow definitions are resolved
 * through the active app registry so the status core does not import a domain
 * package directly.
 */
export const stateMachines = new Proxy({}, {
  get(_target, entityType) {
    const domain = getCutkitRegistry().getDomain('cnc');
    return domain?.workflows?.[entityType] || null;
  },
  ownKeys() {
    const domain = getCutkitRegistry().getDomain('cnc');
    return Reflect.ownKeys(domain?.workflows || {});
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  }
});
