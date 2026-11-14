import { describe, expect, it, vi } from 'vitest';
import { createRegistry } from './index.js';

describe('instance service resolver registration', () => {
  it('does not register the same resolver more than once', () => {
    const registry = createRegistry({ id: 'resolver-deduplication' });
    const resolver = vi.fn(() => null);

    registry.registerInstanceServiceResolver(resolver);
    registry.registerInstanceServiceResolver(resolver);

    expect(registry.getInstanceService('missing_type')).toBeNull();
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('preserves ordered fallback across distinct resolvers', () => {
    const registry = createRegistry({ id: 'resolver-order' });
    const first = vi.fn(() => null);
    const second = vi.fn(() => ({ getById() {} }));

    registry.registerInstanceServiceResolver(first);
    registry.registerInstanceServiceResolver(second);

    expect(registry.getInstanceService('dynamic_type')).toBeTruthy();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
