import { describe, expect, it } from 'vitest';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { getAppRegistry, resetAppRegistryForTests } from './app-registry.js';

describe('application entity service bindings', () => {
  it('gives every domain entity an explicit process query boundary', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const bindings = new Map(registry.listEntityServices().map(binding => [binding.type, binding.service]));

    for (const entity of cncDomain.entities) {
      expect(bindings.get(entity.type)?.processList, entity.type).toBeTypeOf('function');
    }
  });
});
