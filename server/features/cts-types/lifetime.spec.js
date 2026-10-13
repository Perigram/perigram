// Type lifetime (cts SPEC §4, owner decision 2026-10-13): candidates,
// manifest, and the confirmed death — pinned with the repositories and
// the purge mocked at module boundaries.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('h3', () => ({ createError: (error => Object.assign(new Error(error?.message), { statusCode: error?.statusCode })) }));
vi.mock('./repository.js', () => ({
  listByOrganization: vi.fn(),
  deleteByTypeId: vi.fn(async () => ({ acknowledged: true }))
}));
vi.mock('../process-definitions/repository.js', () => ({
  find: vi.fn(async () => [])
}));
vi.mock('../instances/count.js', () => ({ countInstancesOfType: vi.fn(async () => 0) }));
vi.mock('../instances/purge.js', () => ({ purgeInstancesOfType: vi.fn(async () => ({ instances: 0, statusEvents: 0, files: 0 })) }));
vi.mock('../instance-events/service.js', () => ({ publishOrgContractChanged: vi.fn(async () => null) }));

import { findTypeDeathCandidates, typeDeathManifest, killTypesWithData } from './lifetime.js';
import * as repository from './repository.js';
import { find as findDefinitions } from '../process-definitions/repository.js';
import { countInstancesOfType } from '../instances/count.js';
import { purgeInstancesOfType } from '../instances/purge.js';

const storedType = (id, extra = {}) => ({ id, class: 'item', name: id, ...extra });
const definition = (id, typeIds) => ({
  _id: id,
  data: { ctsTypes: Object.fromEntries(typeIds.map((typeId, index) => [`c${index}`, { kind: 'class', typeId }])) }
});

describe('type lifetime (SPEC §4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a type lives while any stored definition declares it — any state', async () => {
    repository.listByOrganization.mockResolvedValue([storedType('kept'), storedType('orphan')]);
    findDefinitions.mockResolvedValue([
      definition('d1', ['kept']),
      definition('d2', []) // a turned-off definition still declares through its stored graph
    ]);
    const candidates = await findTypeDeathCandidates({ organizationId: 'org-1' });
    expect(candidates.map(type => type.id)).toEqual(['orphan']);
  });

  it('definition deletion ignores the dying definition — its declarations do not keep types alive', async () => {
    repository.listByOrganization.mockResolvedValue([storedType('only-its-type'), storedType('shared')]);
    findDefinitions.mockResolvedValue([
      definition('d1', ['only-its-type', 'shared']),
      definition('d2', ['shared'])
    ]);
    const candidates = await findTypeDeathCandidates({ organizationId: 'org-1', ignoringDefinitionId: 'd1' });
    expect(candidates.map(type => type.id)).toEqual(['only-its-type']);
  });

  it('the manifest names each dying type with its live instance count', async () => {
    countInstancesOfType.mockResolvedValue(2);
    const manifest = await typeDeathManifest([storedType('orphan', { name: 'Facade order' })], 'org-1');
    expect(manifest).toEqual([{ typeId: 'orphan', name: 'Facade order', class: 'item', instances: 2 }]);
  });

  it('the confirmed death removes declaration and data together, one event per type', async () => {
    const deaths = await killTypesWithData(
      [{ typeId: 'orphan', name: 'Facade order', class: 'group', instances: 2 }],
      { organizationId: 'org-1', actor: 'user-1' }
    );
    expect(purgeInstancesOfType).toHaveBeenCalledWith('orphan', 'org-1', 'group');
    expect(repository.deleteByTypeId).toHaveBeenCalledWith('org-1', 'orphan');
    expect(deaths[0].purged).toEqual({ instances: 0, statusEvents: 0, files: 0 });
    const { publishOrgContractChanged } = await import('../instance-events/service.js');
    expect(publishOrgContractChanged).toHaveBeenCalledWith('org-1', 'registry', { typeId: 'orphan', killed: true, instances: 0 });
  });
});
