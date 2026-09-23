import { getPerigramRegistry } from '~/server/runtime/perigram-registry.js';

/**
 * Compatibility export for legacy imports. Workflow definitions are resolved
 * through the active app registry so the status core does not import a domain
 * package directly.
 */
export const stateMachines = new Proxy({}, {
  get(_target, typeId) {
    const domain = getPerigramRegistry().getDomain('cnc');
    return domain?.workflows?.[typeId] || null;
  },
  ownKeys() {
    const domain = getPerigramRegistry().getDomain('cnc');
    return Reflect.ownKeys(domain?.workflows || {});
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  }
});
