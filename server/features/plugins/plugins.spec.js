import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));
vi.mock('../instances/count.js', () => ({ countInstancesOfType: vi.fn(async () => 0) }));
vi.mock('../process-definitions/service.js', () => ({ findTypeReferences: vi.fn(async () => []) }));
vi.mock('../instance-events/service.js', () => ({ publishOrgContractChanged: vi.fn() }));
vi.mock('../instances/service.js', () => ({ invalidateInstanceDeclarations: vi.fn() }));
vi.mock('../../utils/auth-helpers.js', () => ({ hasPermission: vi.fn(() => true) }));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async () => null),
  listByOrganization: vi.fn(async () => []),
  upsertByTypeId: vi.fn(),
  deleteByTypeId: vi.fn()
}));

vi.mock('./repository.js', () => ({
  listCatalog: vi.fn(async () => []),
  findCatalogByPluginId: vi.fn(async () => null),
  listInstallsByOrganization: vi.fn(async () => []),
  findInstall: vi.fn(async () => null),
  createInstall: vi.fn(async () => 'install-1'),
  deleteInstall: vi.fn(),
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null)
}));

import * as repository from './repository.js';
import { install, uninstall, listInstalled } from './service.js';
import { countInstancesOfType } from '../instances/count.js';
import { invalidateInstanceDeclarations } from '../instances/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';

const ORG = 'org-1';
const AUTH = { userId: 'user-1', organizationId: ORG };

const coatingListing = {
  pluginId: 'coatings',
  name: 'Coatings',
  version: '2',
  declarations: {
    types: [
      { id: 'coating', class: 'item', label: 'Coating', fields: { code: { base: 'string' } } }
    ]
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  hasPermission.mockReturnValue(true);
  countInstancesOfType.mockResolvedValue(0);
  repository.findInstall.mockResolvedValue(null);
  repository.listInstallsByOrganization.mockResolvedValue([]);
  repository.findCatalogByPluginId.mockResolvedValue(null);
});

describe('plugin installs', () => {
  it('installs a pinned declaration snapshot', async () => {
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
    const result = await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result).toMatchObject({ pluginId: 'coatings', name: 'Coatings', version: '2' });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      pluginId: 'coatings',
      version: '2',
      declarations: coatingListing.declarations
    }));
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('refuses a plugin type shadowing a system type id', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: { types: [{ id: 'cassette', class: 'item', fields: {} }] }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('refuses a plugin type an org declaration already holds', async () => {
    const { listByOrganization } = await import('../cts-types/repository.js');
    listByOrganization.mockResolvedValue([
      { id: 'coating', class: 'item', scope: 'org', organizationId: ORG, version: 1, fields: { code: { base: 'string' } } }
    ]);
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('refuses install without organization admin', async () => {
    hasPermission.mockReturnValue(false);
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses uninstall while instances of a plugin type live', async () => {
    repository.findInstall.mockResolvedValue({
      organizationId: ORG,
      pluginId: 'coatings',
      version: '2',
      declarations: coatingListing.declarations
    });
    countInstancesOfType.mockResolvedValue(3);
    await expect(uninstall({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409, data: { blocked: [{ typeId: 'coating', instances: 3 }] } });
    expect(repository.deleteInstall).not.toHaveBeenCalled();
  });

  it('uninstalls a drained plugin', async () => {
    repository.findInstall.mockResolvedValue({
      organizationId: ORG,
      pluginId: 'coatings',
      version: '2',
      declarations: coatingListing.declarations
    });
    const result = await uninstall({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result).toEqual({ removed: true });
    expect(repository.deleteInstall).toHaveBeenCalledWith(ORG, 'coatings');
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('lists installed plugins from the install snapshots', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      name: 'Coatings',
      version: '2',
      installedAt: new Date('2026-10-08T00:00:00.000Z'),
      declarations: coatingListing.declarations
    }]);
    const installed = await listInstalled({ organizationId: ORG, auth: AUTH });
    expect(installed).toHaveLength(1);
    expect(installed[0]).toMatchObject({ pluginId: 'coatings', name: 'Coatings', version: '2' });
    expect(installed[0].types).toEqual([{ id: 'coating', label: 'Coating', class: 'item' }]);
  });
});
