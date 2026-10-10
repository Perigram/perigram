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
  upsertCatalogListing: vi.fn(),
  listInstallsByOrganization: vi.fn(async () => []),
  findInstall: vi.fn(async () => null),
  findInstallByConnectorToken: vi.fn(async () => null),
  createInstall: vi.fn(async () => 'install-1'),
  deleteInstall: vi.fn(),
  setConnectorToken: vi.fn(),
  updateInstallSnapshot: vi.fn(),
  updateSettings: vi.fn(),
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null),
  listDisabledPacks: vi.fn(async () => []),
  enablePack: vi.fn(),
  disablePack: vi.fn()
}));

import * as repository from './repository.js';
import * as typeStore from '../cts-types/repository.js';
import {
  install, uninstall, listInstalled, servicesForOrganization,
  packServicesForOrganization, commandDefinitionFor, executeConnectorService,
  regenerateConnectorToken, upgradePreview, applyUpgrade, publishListing,
  settingsFor, updateSettings, listPackState, enablePack, disablePack
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
      { id: 'coating', class: 'item', name: 'Coating', fields: { code: { base: 'string' } } }
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
  it('publishes a valid listing normalized through the contract', async () => {
    const valid = await publishListing(coatingListing);
    expect(valid).toMatchObject({ pluginId: 'coatings', version: '2', requires: [] });
    expect(repository.upsertCatalogListing).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'coatings',
      requires: [],
      declarations: expect.objectContaining({
        types: coatingListing.declarations.types,
        services: coatingListing.declarations.services,
        editors: [],
        attachmentKinds: {},
        conversions: []
      })
    }));
  });

  it('refuses to publish a listing the contract rejects', async () => {
    await expect(publishListing({ ...coatingListing, pluginId: 'Not A Slug' }))
      .rejects.toMatchObject({ message: expect.stringContaining('pluginId') });
    expect(repository.upsertCatalogListing).not.toHaveBeenCalled();
  });
  it('installs a pinned declaration snapshot', async () => {
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
    const result = await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result).toMatchObject({ pluginId: 'coatings', name: 'Coatings', version: '2' });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      pluginId: 'coatings',
      version: '2',
      declarations: expect.objectContaining({ types: coatingListing.declarations.types }),
      requires: []
    }));
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('installs the full declaration layer beside the types', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      requires: ['documents'],
      declarations: {
        ...coatingListing.declarations,
        types: [
          ...coatingListing.declarations.types,
          { id: 'coating-sheet', class: 'file', fields: { code: { base: 'string' } } }
        ],
        editors: [{ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] }],
        attachmentKinds: { COATING_DOC: { kind: 'COATING_DOC' } },
        conversions: [{ id: 'docToCoating', label: 'Import', sourceKinds: ['DOC'], target: { kind: 'entity', typeId: 'coating' } }]
      }
    });
    await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      declarations: expect.objectContaining({
        editors: [{ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] }],
        attachmentKinds: { COATING_DOC: { kind: 'COATING_DOC' } },
        conversions: [{ id: 'docToCoating', label: 'Import', sourceKinds: ['DOC'], target: { kind: 'entity', typeId: 'coating' } }]
      }),
      requires: ['documents']
    }));
  });

  it('refuses a required pack that is not mounted or is disabled', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({ ...coatingListing, requires: ['nope'] });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('unknown pack nope') });
    repository.listDisabledPacks.mockResolvedValue(['facade']);
    repository.findCatalogByPluginId.mockResolvedValue({ ...coatingListing, requires: ['facade'] });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('disabled') });
    expect(repository.createInstall).not.toHaveBeenCalled();
    repository.listDisabledPacks.mockResolvedValue([]);
  });

  it('refuses an attachment kind an enabled pack or another install already holds', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: { ...coatingListing.declarations, attachmentKinds: { OCCS_SOURCE: { kind: 'OCCS_SOURCE' } } }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('OCCS_SOURCE') });

    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: { ...coatingListing.declarations, attachmentKinds: { COATING_DOC: { kind: 'COATING_DOC' } } }
    });
    repository.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'other',
      declarations: { types: [], attachmentKinds: { COATING_DOC: { kind: 'COATING_DOC' } } }
    }]);
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('COATING_DOC') });
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('refuses a malformed editor binding at the listing contract', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: { ...coatingListing.declarations, editors: [{ type: 'cassette', surface: 'text-editor', modes: ['edit'] }] }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Invalid plugin listing') });
    expect(repository.createInstall).not.toHaveBeenCalled();
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
    expect(installed[0].types).toEqual([{ id: 'coating', name: 'Coating', class: 'item' }]);
    expect(installed[0].services).toEqual([{ id: 'match', label: 'Coating match', mode: 'claim' }]);
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
    expect(result.services).toEqual([{ id: 'match', label: 'Coating match', mode: 'claim' }]);
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
    requires: ['documents'],
    declarations: {
      types: [
        // changed: gains a required field WITH a covering default step
        {
          id: 'coating',
          class: 'item',
          name: 'Coating',
          fields: {
            code: { base: 'string' },
            gloss: { base: 'string' }
          },
          migrate: [{ kind: 'add-default-field', field: 'gloss', value: 'matte' }]
        },
        // added
        { id: 'primer', class: 'item', name: 'Primer', fields: { code: { base: 'string' } } },
        // added file type with an editor binding
        { id: 'coating-sheet', class: 'file', fields: { code: { base: 'string' } } }
      ],
      services: coatingListing.declarations.services,
      editors: [{ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] }],
      attachmentKinds: { COATING_DOC: { kind: 'COATING_DOC' } },
      conversions: [{ id: 'docToCoating', label: 'Import', sourceKinds: ['DOC'], target: { kind: 'entity', typeId: 'coating' } }]
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
    expect(plan.added.map(type => type.id)).toEqual(['primer', 'coating-sheet']);
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
    expect(persisted.declarations.types.map(type => type.id).sort()).toEqual(['coating', 'coating-sheet', 'primer']);
    // the extended declaration layer rides the pin beside the types
    expect(persisted.declarations.editors).toEqual([{ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] }]);
    expect(persisted.declarations.attachmentKinds).toEqual({ COATING_DOC: { kind: 'COATING_DOC' } });
    expect(persisted.declarations.conversions).toHaveLength(1);
    expect(persisted.requires).toEqual(['documents']);
    // one-time steps never persist (SPEC §11)
    expect(persisted.declarations.types.some(type => type.migrate)).toBe(false);
    expect(applyTypeMigrationSteps).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      steps: [{ kind: 'add-default-field', field: 'gloss', value: 'matte' }]
    }));
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('refuses an upgrade whose pack requirements no longer hold', async () => {
    repository.findCatalogByPluginId.mockImplementation(async () => ({ ...listingV3, requires: ['facade'] }));
    repository.listDisabledPacks.mockResolvedValue(['facade']);
    await expect(applyUpgrade({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('facade') });
    expect(repository.updateInstallSnapshot).not.toHaveBeenCalled();
    repository.listDisabledPacks.mockResolvedValue([]);
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

describe('endpoint-mode services', () => {
  const endpointInstall = {
    organizationId: ORG,
    pluginId: 'coatings',
    name: 'Coatings',
    version: '2',
    declarations: coatingListing.declarations,
    services: [
      { id: 'match', label: 'Coating match', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } }
    ],
    endpoints: { match: 'https://executor.example/match' },
    authToken: 'publisher-key'
  };

  beforeEach(() => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? endpointInstall : null
    ));
  });

  it('calls the configured endpoint with the service input and API key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ shade: 'matte' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await executeConnectorService(
        { id: 'plugin.coatings.match', service: 'plugin.coatings' },
        { parameters: { code: 'C-1' }, auth: AUTH }
      );
      expect(result).toEqual({ shade: 'matte' });
      expect(fetchMock).toHaveBeenCalledWith('https://executor.example/match', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer publisher-key' }),
        body: JSON.stringify({ code: 'C-1' })
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses execution when the endpoint is not configured', async () => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings'
        ? { ...endpointInstall, endpoints: {} }
        : null
    ));
    await expect(executeConnectorService(
      { id: 'plugin.coatings.match', service: 'plugin.coatings' },
      { parameters: {}, auth: AUTH }
    )).rejects.toMatchObject({ statusCode: 400 });
  });

  it('surfaces executor failures as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    try {
      await expect(executeConnectorService(
        { id: 'plugin.coatings.match', service: 'plugin.coatings' },
        { parameters: {}, auth: AUTH }
      )).rejects.toMatchObject({ statusCode: 502 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('saves and serves connection settings, refusing endpoints for claim services', async () => {
    const settings = await settingsFor({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(settings.services).toEqual([
      { id: 'match', label: 'Coating match', mode: 'endpoint', endpoint: 'https://executor.example/match' }
    ]);
    expect(settings.authToken).toBe('publisher-key');

    const saved = await updateSettings({
      organizationId: ORG,
      pluginId: 'coatings',
      endpoints: { match: 'https://cloud.example/match' },
      authToken: 'new-key',
      auth: AUTH
    });
    expect(repository.updateSettings).toHaveBeenCalledWith(ORG, 'coatings', {
      endpoints: { match: 'https://cloud.example/match' },
      authToken: 'new-key'
    });
    expect(saved.services[0].endpoint).toBe('https://executor.example/match');

    const claimInstall = {
      ...endpointInstall,
      services: [{ id: 'match', label: 'Coating match', signature: { input: { base: 'json' }, output: { base: 'json' } } }]
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? claimInstall : null
    ));
    await expect(updateSettings({
      organizationId: ORG,
      pluginId: 'coatings',
      endpoints: { match: 'https://cloud.example/match' },
      auth: AUTH
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('mounted-pack enablement', () => {
  beforeEach(() => {
    repository.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('lists every mounted pack as enabled by default', async () => {
    repository.listDisabledPacks.mockResolvedValue([]);
    const state = await listPackState({ organizationId: ORG, auth: AUTH });
    const byId = new Map(state.map(item => [item.pluginId, item]));
    expect(byId.get('facade')).toMatchObject({ pack: true, enabled: true, name: 'Facade fabrication' });
    expect(byId.get('documents')).toMatchObject({ pack: true, enabled: true });
    expect(byId.get('tech-drawing')).toMatchObject({ pack: true, enabled: true });
  });

  it('enabling a pack cascades over its disabled requirements', async () => {
    repository.listDisabledPacks.mockResolvedValue(['facade', 'documents', 'tech-drawing']);
    const result = await enablePack({ organizationId: ORG, packId: 'facade', auth: AUTH });
    expect(result).toMatchObject({ packId: 'facade', enabled: true });
    const enabledIds = repository.enablePack.mock.calls.map(call => call[1]).sort();
    expect(enabledIds).toEqual(['documents', 'facade', 'tech-drawing']);
  });

  it('refuses disabling a pack an enabled pack requires', async () => {
    repository.listDisabledPacks.mockResolvedValue([]);
    await expect(disablePack({ organizationId: ORG, packId: 'documents', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(repository.disablePack).not.toHaveBeenCalled();
  });

  it('refuses disabling a pack an installed plugin requires', async () => {
    // both dependent packs disabled so the pack-dependent gate stays quiet
    // and the installed-plugin gate is the one that refuses
    repository.listDisabledPacks.mockResolvedValue(['facade', 'tech-drawing']);
    repository.listInstallsByOrganization.mockResolvedValue([
      { organizationId: ORG, pluginId: 'coatings', requires: ['documents'] }
    ]);
    await expect(disablePack({ organizationId: ORG, packId: 'documents', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('required by installed plugin coatings') });
    expect(repository.disablePack).not.toHaveBeenCalled();
    repository.listDisabledPacks.mockResolvedValue([]);
    repository.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('refuses disabling a pack whose types have live instances', async () => {
    countInstancesOfType.mockResolvedValue(12);
    await expect(disablePack({ organizationId: ORG, packId: 'facade', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(repository.disablePack).not.toHaveBeenCalled();
    countInstancesOfType.mockResolvedValue(0);
  });

  it('refuses disabling a pack the org view still depends on', async () => {
    typeStore.listByOrganization.mockResolvedValue([
      {
        id: 'facade-job', class: 'group', scope: 'org', organizationId: ORG, version: 1,
        fields: {},
        edges: { children: { parts: { types: ['cassette'] } } }
      }
    ]);
    await expect(disablePack({ organizationId: ORG, packId: 'facade', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(repository.disablePack).not.toHaveBeenCalled();
    typeStore.listByOrganization.mockResolvedValue([]);
  });

  it('disables a drained pack and invalidates the org view', async () => {
    const result = await disablePack({ organizationId: ORG, packId: 'facade', auth: AUTH });
    expect(result).toEqual({ packId: 'facade', enabled: false });
    expect(repository.disablePack).toHaveBeenCalledWith(ORG, 'facade', 'user-1');
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('hidden packs leave the composed service list', async () => {
    repository.listDisabledPacks.mockResolvedValue(['facade']);
    const services = await packServicesForOrganization(ORG);
    expect(services.some(service => service.id === 'nesting.solve')).toBe(false);
    repository.listDisabledPacks.mockResolvedValue([]);
  });
});
