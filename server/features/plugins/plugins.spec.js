import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));
vi.mock('../instances/count.js', () => ({ countInstancesOfType: vi.fn(async () => 0) }));
vi.mock('../instances/migrations.js', () => ({
  applyTypeMigrationSteps: vi.fn(async () => ({ appliedAt: '2026-10-08T00:00:00.000Z', actor: 'user-1', counts: {}, failures: [] }))
}));
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

vi.mock('../../core/tasks/service.js', () => ({
  enqueueTask: vi.fn(async (taskId, input, auth, options) => ({
    _id: 'run-1',
    taskId,
    input,
    workerType: options?.workerType,
    status: 'QUEUED'
  }))
}));

vi.mock('./repository.js', () => ({
  listCatalog: vi.fn(async () => []),
  findCatalogByPluginId: vi.fn(async () => null),
  listInstallsByOrganization: vi.fn(async () => []),
  findInstall: vi.fn(async () => null),
  findInstallByConnectorToken: vi.fn(async () => null),
  createInstall: vi.fn(async () => 'install-1'),
  deleteInstall: vi.fn(),
  setConnectorToken: vi.fn(),
  updateInstallSnapshot: vi.fn(),
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null)
}));

import * as repository from './repository.js';
import * as typeStore from '../cts-types/repository.js';
import {
  install, uninstall, listInstalled, servicesForOrganization,
  packServicesForOrganization, commandDefinitionFor, executeConnectorService,
  regenerateConnectorToken, upgradePreview, applyUpgrade
} from './service.js';
import { enqueueTask } from '../../core/tasks/service.js';
import { countInstancesOfType } from '../instances/count.js';
import { applyTypeMigrationSteps } from '../instances/migrations.js';
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
    ],
    services: [
      {
        id: 'match',
        label: 'Coating match',
        signature: { input: { base: 'json' }, output: { base: 'json' } }
      }
    ]
  }
};

const coatingInstall = {
  organizationId: ORG,
  pluginId: 'coatings',
  name: 'Coatings',
  version: '2',
  declarations: coatingListing.declarations,
  services: coatingListing.declarations.services
};

beforeEach(() => {
  vi.clearAllMocks();
  hasPermission.mockReturnValue(true);
  countInstancesOfType.mockResolvedValue(0);
  repository.findInstall.mockResolvedValue(null);
  repository.listInstallsByOrganization.mockResolvedValue([]);
  repository.findCatalogByPluginId.mockResolvedValue(null);
  typeStore.findByTypeId.mockResolvedValue(null);
  typeStore.listByOrganization.mockResolvedValue([]);
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
      declarations: { types: coatingListing.declarations.types }
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
      declarations: coatingListing.declarations,
      services: coatingListing.declarations.services
    }]);
    const installed = await listInstalled({ organizationId: ORG, auth: AUTH });
    expect(installed).toHaveLength(1);
    expect(installed[0]).toMatchObject({ pluginId: 'coatings', name: 'Coatings', version: '2' });
    expect(installed[0].types).toEqual([{ id: 'coating', label: 'Coating', class: 'item' }]);
    expect(installed[0].services).toEqual([{ id: 'match', label: 'Coating match' }]);
  });
});

describe('connector services', () => {
  beforeEach(() => {
    repository.listInstallsByOrganization.mockResolvedValue([coatingInstall]);
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? coatingInstall : null
    ));
  });

  it('installs services beside types and mints a connector token', async () => {
    repository.findInstall.mockResolvedValue(null);
    repository.listInstallsByOrganization.mockResolvedValue([]);
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
    const result = await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result.services).toEqual([{ id: 'match', label: 'Coating match' }]);
    const persisted = repository.createInstall.mock.calls[0][0];
    expect(persisted.services).toEqual(coatingListing.declarations.services);
    expect(persisted.connectorToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('refuses a service id that is not a slug', async () => {
    repository.findInstall.mockResolvedValue(null);
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        types: coatingListing.declarations.types,
        services: [{ id: 'Not A Slug', signature: { input: { base: 'json' }, output: { base: 'json' } } }]
      }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('composes installed services as plugin-qualified species records', async () => {
    const services = await servicesForOrganization(ORG);
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({
      id: 'plugin.coatings.match',
      species: 'service',
      command: 'plugin.coatings.match',
      group: 'Coatings'
    });
    const merged = await packServicesForOrganization(ORG);
    expect(merged.some(service => service.id === 'nesting.solve')).toBe(true);
    expect(merged.some(service => service.id === 'plugin.coatings.match')).toBe(true);
  });

  it('resolves the command definition only for the installing organization', async () => {
    const command = await commandDefinitionFor('plugin.coatings.match', AUTH);
    expect(command).toMatchObject({ id: 'plugin.coatings.match', service: 'plugin.coatings', plugin: true });
    const foreign = await commandDefinitionFor('plugin.coatings.match', { userId: 'u2', organizationId: 'org-2' });
    expect(foreign).toBeNull();
  });

  it('executes a connector service as a scoped queued run', async () => {
    const result = await executeConnectorService(
      { id: 'plugin.coatings.match', service: 'plugin.coatings' },
      { parameters: { shade: 'matte' }, auth: AUTH }
    );
    expect(result.tasks).toHaveLength(1);
    expect(enqueueTask).toHaveBeenCalledWith(
      'plugin.coatings.match',
      { parameters: { value: { shade: 'matte' } } },
      AUTH,
      expect.objectContaining({
        workerType: `plugin.coatings@${ORG}`,
        definition: expect.objectContaining({
          id: 'plugin.coatings.match',
          executor: { workerType: `plugin.coatings@${ORG}` }
        })
      })
    );
  });

  it('lists mounted packs as read-only built-ins', async () => {
    const { listSystemPacks } = await import('./service.js');
    const packs = listSystemPacks();
    const byId = new Map(packs.map(pack => [pack.id, pack]));
    expect(byId.get('facade')).toMatchObject({ id: 'facade', name: 'Facade fabrication' });
    expect(byId.get('facade').types.some(type => type.id === 'cassette')).toBe(true);
    expect(byId.get('documents')).toMatchObject({ name: 'Documents' });
    expect(byId.get('tech-drawing')).toMatchObject({ name: 'Technical drawing' });
  });

  it('regenerates the connector token', async () => {
    const result = await regenerateConnectorToken({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(repository.setConnectorToken).toHaveBeenCalledWith(ORG, 'coatings', result.token);
  });
});

describe('upgrades', () => {
  const installedV2 = {
    ...coatingInstall,
    version: '2',
    declarations: { types: coatingListing.declarations.types }
  };
  const listingV3 = {
    ...coatingListing,
    version: '3',
    declarations: {
      types: [
        // changed: gains a required field WITH a covering default step
        {
          id: 'coating',
          class: 'item',
          label: 'Coating',
          fields: {
            code: { base: 'string' },
            gloss: { base: 'string' }
          },
          migrate: [{ kind: 'add-default-field', field: 'gloss', value: 'matte' }]
        },
        // added
        { id: 'primer', class: 'item', label: 'Primer', fields: { code: { base: 'string' } } }
      ],
      services: coatingListing.declarations.services
    }
  };

  beforeEach(() => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? installedV2 : null
    ));
    repository.findCatalogByPluginId.mockImplementation(async pluginId => (
      pluginId === 'coatings' ? listingV3 : null
    ));
  });

  it('reports the available catalog version on installed plugins', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([installedV2]);
    const installed = await listInstalled({ organizationId: ORG, auth: AUTH });
    expect(installed[0].availableVersion).toBe('3');
  });

  it('previews additions, changes, and declared migration steps', async () => {
    const plan = await upgradePreview({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(plan).toMatchObject({ from: '2', to: '3' });
    expect(plan.added.map(type => type.id)).toEqual(['primer']);
    expect(plan.changed.map(change => change.typeId)).toEqual(['coating']);
    expect(plan.blocked).toEqual([]);
    const coating = plan.changed[0];
    expect(coating.breaking.length).toBeGreaterThan(0);
    expect(coating.covered).toBe(true);
  });

  it('blocks a removed type that still has live instances', async () => {
    const removedListing = {
      ...listingV3,
      declarations: { types: [listingV3.declarations.types[1]], services: [] }
    };
    repository.findCatalogByPluginId.mockImplementation(async () => removedListing);
    countInstancesOfType.mockResolvedValue(4);
    const plan = await upgradePreview({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(plan.blocked).toEqual([
      expect.objectContaining({ typeId: 'coating', instances: 4 })
    ]);
    await expect(applyUpgrade({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(repository.updateInstallSnapshot).not.toHaveBeenCalled();
    countInstancesOfType.mockResolvedValue(0);
  });

  it('applies a clean upgrade as the new pinned snapshot and runs covered steps', async () => {
    countInstancesOfType.mockResolvedValue(7);
    const result = await applyUpgrade({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result).toMatchObject({ pluginId: 'coatings', version: '3' });
    const persisted = repository.updateInstallSnapshot.mock.calls[0][2];
    expect(persisted.version).toBe('3');
    expect(persisted.declarations.types.map(type => type.id).sort()).toEqual(['coating', 'primer']);
    // one-time steps never persist (SPEC §11)
    expect(persisted.declarations.types.some(type => type.migrate)).toBe(false);
    expect(applyTypeMigrationSteps).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      steps: [{ kind: 'add-default-field', field: 'gloss', value: 'matte' }]
    }));
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('refuses the upgrade when already at the catalog version', async () => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? installedV2 : null
    ));
    repository.findCatalogByPluginId.mockImplementation(async () => ({ ...listingV3, version: '2' }));
    await expect(upgradePreview({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
