import { describe, expect, it, vi } from 'vitest';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { getAppRegistry, resetAppRegistryForTests } from './app-registry.js';
import * as librariesService from '~/server/features/libraries/service.js';

describe('application entity service bindings', () => {
  it('gives every domain entity explicit process read boundaries', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const bindings = new Map(registry.listEntityServices().map(binding => [binding.type, binding.service]));

    for (const entity of cncDomain.entities) {
      expect(bindings.get(entity.type)?.processList, entity.type).toBeTypeOf('function');
      expect(bindings.get(entity.type)?.processGetById, entity.type).toBeTypeOf('function');
    }
  });

  it('adapts process library reads to the feature service auth signature', async () => {
    const getById = vi.spyOn(librariesService, 'getById').mockResolvedValueOnce({ _id: 'library-1' });
    resetAppRegistryForTests();
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'member',
      effectivePermissions: { libraries: [{ level: 'read' }] }
    };

    await getAppRegistry().getEntityService('library').processGetById('library-1', auth);

    expect(getById).toHaveBeenCalledWith('library-1', 'user-1', 'org-1', 'member', auth);
  });
});
