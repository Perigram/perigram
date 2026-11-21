import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../instances/index.js', () => ({
  getOrganizationChangeSequence: vi.fn(async () => 0),
  runOrganizationChange: vi.fn(async (_organizationId, _metadata, mutate) => await mutate())
}));
vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []), pruneInstanceUniqueIndexes: vi.fn(async () => []) }));
vi.mock('../instances/count.js', () => ({ countInstancesOfType: vi.fn(async () => 5) }));
vi.mock('../instances/migrations.js', () => ({
  applyTypeMigrationSteps: vi.fn(async () => ({ appliedAt: '2026-09-22T00:00:00.000Z', actor: 'SYSTEM', counts: {}, failures: [] }))
}));
vi.mock('../process-definitions/service.js', () => ({
  findTypeReferences: vi.fn(async () => [])
}));
vi.mock('../plugins/repository.js', () => ({
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null),
  listInstallsByOrganization: vi.fn(async () => [])
}));

vi.mock('./repository.js', () => ({
  create: vi.fn(),
  findByTypeId: vi.fn(async () => null),
  listByOrganization: vi.fn(async () => []),
  upsertByTypeId: vi.fn(async (orgId, typeId, data) => ({ ...data })),
  deleteByTypeId: vi.fn(async () => true)
}));

import * as repository from './repository.js';
import * as pluginInstalls from '../plugins/repository.js';
import documentsListing from '../../../workers/documents/listing.json' with { type: 'json' };
const documentsTypes = documentsListing.declarations.types;
pluginInstalls.listDeclarationsByOrganization.mockImplementation(async () => documentsTypes);
import { compileRegistryForOrganization, defineType, removeType, describeOrganizationTypes } from './service.js';
import { findTypeReferences } from '../process-definitions/service.js';
import { countInstancesOfType } from '../instances/count.js';

const ORG = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  repository.findByTypeId.mockResolvedValue(null);
  repository.listByOrganization.mockResolvedValue([]);
  pluginInstalls.listDeclarationsByOrganization.mockImplementation(async () => documentsTypes);
});

describe('cts type storage', () => {
  it('reserves one stable organization sequence for a declaration write', async () => {
    const instances = await import('../instances/index.js');

    await defineType({
      id: 'gadget',
      name: 'Gadget',
      class: 'file',
      fields: { code: { base: 'string', identifier: true } }
    }, { organizationId: ORG });

    expect(instances.getOrganizationChangeSequence).toHaveBeenCalledWith(ORG);
    expect(instances.runOrganizationChange).toHaveBeenCalledTimes(1);
    expect(instances.runOrganizationChange).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ kind: 'cts-type-declared', typeId: 'gadget' }),
      expect.any(Function),
      { expectedSequence: 0 }
    );
  });

  it('compiles the org view as system types plus the org overlay', async () => {
    repository.listByOrganization.mockResolvedValue([
      { id: 'widget', name: 'Widget', class: 'file', scope: 'org', organizationId: ORG, version: 1, fields: { code: { base: 'string', identifier: true } } }
    ]);
    const bundle = await describeOrganizationTypes(ORG);
    expect(bundle.bundle.ok).toBe(true);
    expect(bundle.bundle.types.some(type => type.id === 'widget' && type.scope === 'org')).toBe(true);
    expect(bundle.bundle.types.filter(type => type.id === 'xlsx-workbook')).toHaveLength(1);
    expect(bundle.bundle.types.filter(type => type.id === 'queue')).toHaveLength(0);
    expect(bundle.bundle.types.filter(type => type.id === 'organization').length).toBeGreaterThan(0);
    // no mounted pack declares attachment kinds today (the facade kinds ride the installed plugin layer)
  });

  it('composes installed plugin declarations as a resolution source beside the org overlay', async () => {
    const installedTypes = [
      { id: 'coating', class: 'item', fields: { code: { base: 'string', identifier: true } } },
      { id: 'coating-sheet', class: 'file', fields: { code: { base: 'string', identifier: true } } }
    ];
    pluginInstalls.listDeclarationsByOrganization.mockResolvedValue(installedTypes);
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      declarations: {
        types: installedTypes,
        editors: [{ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] }],
        attachmentKinds: { COATING_DOC: { kind: 'COATING_DOC', mimeType: 'text/plain' } }
      }
    }]);
    const bundle = await describeOrganizationTypes(ORG);
    expect(bundle.bundle.ok).toBe(true);
    expect(bundle.bundle.types.filter(type => type.id === 'coating')).toHaveLength(1);
    // the installed layer of the served vocabulary: editors and attachment
    // kinds compose beside the packs under the same laws
    expect(bundle.editors).toContainEqual({ type: 'coating-sheet', surface: 'text-editor', modes: ['edit'] });
    expect(bundle.attachmentKinds.COATING_DOC).toMatchObject({ mimeType: 'text/plain' });
  });

  it('serves installed surface declarations with same-origin proxy module URLs', async () => {
    const installedTypes = [{ id: 'coating-sheet', class: 'file', fields: { code: { base: 'string', identifier: true } } }];
    pluginInstalls.listDeclarationsByOrganization.mockResolvedValue(installedTypes);
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      endpoints: { match: 'http://10.0.0.5:8790/match' },
      declarations: {
        types: installedTypes,
        editors: [{ type: 'coating-sheet', surface: 'coating-designer', modes: ['edit'] }],
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1, ownsChrome: true }]
      }
    }]);
    const view = await describeOrganizationTypes(ORG);
    // The endpoint origin (10.0.0.5 — the server's network) never reaches
    // the browser: modules load same-origin through the plugin-module
    // proxy, valid on every deployment origin. Chrome ownership is
    // carried to the client so record hosts mount the editor flush.
    expect(view.surfaces).toContainEqual({
      id: 'coating-designer',
      url: '/api/plugins/coatings/module/surfaces/coating-designer.mjs',
      surfaceContract: 1,
      ownsChrome: true
    });
    // Without a configured endpoint the URL stays null — the loader shows
    // the connect-the-executor state instead of guessing an origin.
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      declarations: {
        types: installedTypes,
        editors: [],
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }]
      }
    }]);
    const unconnected = await describeOrganizationTypes(ORG);
    expect(unconnected.surfaces).toContainEqual({ id: 'coating-designer', url: null, surfaceContract: 1 });
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('serves installed client engines beside their local service ids', async () => {
    const installedTypes = [{ id: 'coating', class: 'item', fields: { code: { base: 'string', identifier: true } } }];
    pluginInstalls.listDeclarationsByOrganization.mockResolvedValue(installedTypes);
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      version: '2',
      services: [
        { id: 'spin', mode: 'local', signature: { input: { base: 'json' }, output: { base: 'json' } } },
        { id: 'match', label: 'Coating match', signature: { input: { base: 'json' }, output: { base: 'json' } } }
      ],
      declarations: {
        types: installedTypes,
        engine: { module: '/engine/index.mjs' }
      }
    }]);
    const view = await describeOrganizationTypes(ORG);
    expect(view.clientEngines).toEqual([
      {
        pluginId: 'coatings',
        version: '2',
        url: '/api/plugins/coatings/module/engine/index.mjs',
        services: ['plugin.coatings.spin']
      }
    ]);
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('serves browser JavaScript runtimes with org-scoped package entry URLs', async () => {
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      version: '4',
      packageAssets: { count: 1 },
      declarations: {
        types: [],
        runtimes: [{ id: 'javascript', language: 'javascript', version: '1', entry: '/runtime.mjs', targets: ['browser', 'server'] }]
      },
      services: [{ id: 'shape', execution: { runtime: 'javascript', targets: ['browser'], kind: 'pure' } }]
    }]);
    const view = await describeOrganizationTypes(ORG);
    expect(view.clientRuntimes).toEqual([{
      organizationId: ORG,
      pluginId: 'coatings',
      version: '4',
      runtime: {
        id: 'javascript', language: 'javascript', version: '1', entry: '/runtime.mjs',
        targets: ['browser', 'server'], entryUrl: '/api/plugins/coatings/module/runtime.mjs'
      },
      services: [{ id: 'shape', execution: { runtime: 'javascript', targets: ['browser'], kind: 'pure' } }],
      previewRenderers: []
    }]);
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });


  it('resolves plugin preview surfaces for worker node renderers', async () => {
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      version: '4',
      packageAssets: { count: 1 },
      declarations: {
        types: [],
        runtimes: [{ id: 'javascript', language: 'javascript', version: '1', entry: '/runtime.mjs', targets: ['browser'] }],
        surfaces: [
          { id: 'mesh-preview', module: '/preview/mesh.mjs', surfaceContract: 1, kind: 'preview' },
          { id: 'editor', module: '/editor.mjs', surfaceContract: 4, kind: 'editor' }
        ]
      },
      services: []
    }]);
    const view = await describeOrganizationTypes(ORG);
    expect(view.clientRuntimes[0].previewRenderers).toEqual([{
      id: 'mesh-preview',
      url: '/api/plugins/coatings/module/preview/mesh.mjs',
      surfaceContract: 1
    }]);
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('serves organization-owned runtime provider bindings', async () => {
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      version: '4',
      packageAssets: { count: 1 },
      declarations: {
        types: [],
        runtimes: [{ id: 'javascript', language: 'javascript', version: '1', entry: '/runtime.mjs', targets: ['browser'] }]
      },
      services: []
    }]);
    const view = await describeOrganizationTypes(ORG);
    expect(view.clientRuntimes[0]).toMatchObject({
      organizationId: ORG,
      pluginId: 'coatings',
      runtime: { id: 'javascript', entryUrl: '/api/plugins/coatings/module/runtime.mjs' }
    });
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('refuses an installed editor binding the composed view cannot serve', async () => {
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      organizationId: ORG,
      pluginId: 'coatings',
      declarations: {
        types: [],
        editors: [{ type: 'ghost', surface: 'text-editor', modes: ['edit'] }]
      }
    }]);
    await expect(describeOrganizationTypes(ORG))
      .rejects.toMatchObject({ statusCode: 500, message: expect.stringContaining('ghost') });
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('composes the installed documents plugin layer into the org view', async () => {
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      pluginId: 'documents',
      name: 'Documents',
      version: '1',
      declarations: documentsListing.declarations,
      services: documentsListing.declarations.services
    }]);
    const { bundle, editors } = await describeOrganizationTypes(ORG);
    expect(bundle.ok).toBe(true);
    expect(bundle.types.some(type => type.id === 'xlsx-workbook')).toBe(true);
    expect(editors.some(editor => editor.type === 'text-document')).toBe(true);
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('serves the installed plugin editor bindings with the type view', async () => {
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([{
      pluginId: 'documents',
      name: 'Documents',
      version: '1',
      declarations: documentsListing.declarations,
      services: documentsListing.declarations.services
    }]);
    const described = await describeOrganizationTypes(ORG);
    const byType = new Map((described.editors || []).map(editor => [editor.type, editor]));
    expect(byType.get('text-document')).toMatchObject({ surface: 'text-editor' });
    expect(byType.get('cassette')).toBeUndefined();
    pluginInstalls.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('stores valid org declarations after full-view compile', async () => {
    const stored = await defineType({ id: 'gadget', name: 'Gadget', class: 'file', fields: { code: { base: 'string', identifier: true } } }, { organizationId: ORG });
    expect(stored.id).toBe('gadget');
    expect(stored.scope).toBe('org');
    expect(stored.version).toBe(1);
    expect(repository.upsertByTypeId).toHaveBeenCalled();
  });

  it('allows breaking redefinition of a type with zero instances', async () => {
    const { countInstancesOfType } = await import('../instances/count.js');
    countInstancesOfType.mockResolvedValueOnce(0);
    const storedGadget = { id: 'gadget', class: 'file', scope: 'org', organizationId: ORG, version: 3,
      fields: { code: { base: 'string', identifier: true }, gone: { base: 'string' } } };
    repository.findByTypeId.mockResolvedValue(storedGadget);
    repository.listByOrganization.mockResolvedValue([storedGadget]);
    const stored = await defineType(
      { id: 'gadget', class: 'file', fields: { code: { base: 'string', identifier: true } } },
      { organizationId: ORG }
    );
    expect(stored.id).toBe('gadget');
    expect(stored.version).toBe(4);
  });

  it('refuses breaking redefinition and rolls back new writes on cross-type breakage', async () => {
    repository.listByOrganization.mockResolvedValue([
      { id: 'gadget', class: 'file', scope: 'org', organizationId: ORG, version: 3,
        fields: { code: { base: 'string', identifier: true }, gone: { base: 'string' } } }
    ]);
    await expect(defineType(
      { id: 'gadget', class: 'file', fields: { code: { base: 'string', identifier: true } } },
      { organizationId: ORG }
    )).rejects.toThrow(/breaking change/);
  });

  it('attaches the binding processes to a refused write (edit-path blast radius)', async () => {
    repository.listByOrganization.mockResolvedValue([
      { id: 'gadget', class: 'file', scope: 'org', organizationId: ORG, version: 3,
        fields: { code: { base: 'string', identifier: true }, gone: { base: 'string' } } }
    ]);
    findTypeReferences.mockResolvedValueOnce([{ id: 'pd-1', name: 'Production', status: 'ACTIVE' }]);
    const error = await defineType(
      { id: 'gadget', class: 'file', fields: { code: { base: 'string', identifier: true } } },
      { organizationId: ORG }
    ).catch(e => e);
    expect(error.statusCode).toBe(400);
    expect(error.message).toMatch(/breaking change/);
    expect(error.data).toMatchObject({ boundBy: [{ id: 'pd-1', name: 'Production' }] });
  });

  it('executes covered migrate steps after persisting and records the summary', async () => {
    const { applyTypeMigrationSteps } = await import('../instances/migrations.js');
    applyTypeMigrationSteps.mockResolvedValueOnce({
      appliedAt: '2026-09-22T00:00:00.000Z',
      actor: 'admin',
      counts: { 'rename-field': 5 },
      failures: []
    });
    const existing = {
      id: 'widget', class: 'item', scope: 'org', organizationId: ORG, version: 3,
      fields: { code: { base: 'string', identifier: true } }
    };
    repository.findByTypeId.mockResolvedValue(existing);
    repository.listByOrganization.mockResolvedValue([existing]);
    const stored = await defineType(
      {
        id: 'widget', class: 'item',
        fields: { serial: { base: 'string', identifier: true } },
        migrate: [{ kind: 'rename-field', from: 'code', to: 'serial' }]
      },
      { organizationId: ORG, actor: 'admin' }
    );
    expect(stored.version).toBe(4);
    expect(stored.migrated).toMatchObject({ actor: 'admin', counts: { 'rename-field': 5 } });
    expect(applyTypeMigrationSteps).toHaveBeenCalledWith(expect.objectContaining({
      toVersion: 4,
      actor: 'admin',
      steps: [{ kind: 'rename-field', from: 'code', to: 'serial' }]
    }));
  });

  it('persists covered declarations step-free; the next additive edit compiles clean', async () => {
    // Steps are one-time (SPEC §11): a covered apply executes them, and the
    // stored declaration must NOT carry them forward — a stored step set
    // rotting on the declaration is the "declared migration step … matches
    // no breaking change" wedge for every round-tripping client.
    const { applyTypeMigrationSteps } = await import('../instances/migrations.js');
    applyTypeMigrationSteps.mockResolvedValueOnce({
      appliedAt: '2026-09-23T00:00:00.000Z', actor: 'admin', counts: {}, failures: []
    });
    const existing = {
      id: 'child', class: 'item', scope: 'org', organizationId: ORG, version: 2,
      fields: { anythin: { base: 'string', label: 'Anythin' } },
      states: { main: { values: ['active'], initial: 'active' } }
    };
    repository.findByTypeId.mockResolvedValue(existing);
    repository.listByOrganization.mockResolvedValue([existing]);
    const stored = await defineType(
      {
        id: 'child', class: 'item',
        fields: { anything: { base: 'string', label: 'Anything' } },
        states: { main: { values: ['active'], initial: 'active' } },
        migrate: [{ kind: 'rename-field', from: 'anythin', to: 'anything' }]
      },
      { organizationId: ORG, actor: 'admin' }
    );
    expect(stored.version).toBe(3);
    expect(stored.migrated).toMatchObject({ actor: 'admin' });
    // Every persist is step-free and unsets the key from earlier documents.
    const [lastOrg, lastTypeId, lastPayload, lastOptions] = repository.upsertByTypeId.mock.calls.at(-1);
    expect(lastOrg).toBe(ORG);
    expect(lastTypeId).toBe('child');
    expect(Object.hasOwn(lastPayload, 'migrate')).toBe(false);
    expect(lastOptions).toEqual({ unset: ['migrate'] });

    // The rot the strip prevents: a client that round-trips the OLD stored
    // shape (steps still on the declaration) carries them into its next
    // post and is refused — the gate reads the NEXT declaration's steps.
    repository.findByTypeId.mockResolvedValue(stored);
    repository.listByOrganization.mockResolvedValue([stored]);
    await expect(defineType(
      {
        id: 'child', class: 'item',
        fields: { anything: { base: 'string' }, note: { base: 'string', nullable: true } },
        states: { main: { values: ['active'], initial: 'active' } },
        migrate: [{ kind: 'rename-field', from: 'anythin', to: 'anything' }]
      },
      { organizationId: ORG }
    )).rejects.toThrow(/declared migration step rename-field anythin -> anything matches no breaking change/);

    // With the strip, the stored declaration is step-free, so the next
    // additive edit compiles clean without manually clearing anything.
    const next = await defineType(
      {
        id: 'child', class: 'item',
        fields: { anything: { base: 'string' }, note: { base: 'string', nullable: true } },
        states: { main: { values: ['active'], initial: 'active' } }
      },
      { organizationId: ORG }
    );
    expect(next.version).toBe(4);
  });

  it('refuses a breaking redefinition whose steps do not cover the diff', async () => {
    const existing = {
      id: 'widget', class: 'item', scope: 'org', organizationId: ORG, version: 3,
      fields: { code: { base: 'string', identifier: true } }
    };
    repository.findByTypeId.mockResolvedValue(existing);
    repository.listByOrganization.mockResolvedValue([existing]);
    await expect(defineType(
      {
        id: 'widget', class: 'item',
        fields: {}
      },
      { organizationId: ORG }
    )).rejects.toThrow(/without a covering declared migration/);
    const { applyTypeMigrationSteps } = await import('../instances/migrations.js');
    expect(applyTypeMigrationSteps).not.toHaveBeenCalled();
  });

  it('attaches the migration plan to an uncovered refusal (SPEC §14 authoring payload)', async () => {
    // The refusal names what broke AND offers the declarative step: the
    // 400 carries the computed plan's breaking change records plus the
    // gate's required-step errors beside the binder blast radius.
    const existing = {
      id: 'child', class: 'item', scope: 'org', organizationId: ORG, version: 2,
      fields: { anythin: { base: 'string', label: 'Anythin' } },
      states: { main: { values: ['active'], initial: 'active' } }
    };
    repository.findByTypeId.mockResolvedValue(existing);
    repository.listByOrganization.mockResolvedValue([existing]);
    findTypeReferences.mockResolvedValueOnce([{ id: 'pd-1', name: 'Production', status: 'ACTIVE' }]);
    const error = await defineType(
      {
        id: 'child', class: 'item',
        fields: { anything: { base: 'string', label: 'Anything' } },
        states: { main: { values: ['active'], initial: 'active' } }
      },
      { organizationId: ORG }
    ).catch(e => e);
    expect(error.statusCode).toBe(400);
    expect(error.data.boundBy).toEqual([{ id: 'pd-1', name: 'Production', status: 'ACTIVE' }]);
    expect(error.data.plan.changes).toEqual([
      { severity: 'breaking', kind: 'remove-field', field: 'anythin' },
      { severity: 'breaking', kind: 'add-required-field', field: 'anything' }
    ]);
    expect(error.data.plan.requiredSteps).toEqual([
      'remove-field anythin requires a remove-field or rename-field step',
      'add-required-field anything requires an add-default-field step'
    ]);
  });

  it('refuses invalid declarations as 400s', async () => {
    await expect(defineType({ id: 'bad', class: 'nope', fields: {} }, { organizationId: ORG }))
      .rejects.toThrow(/unknown class/);
    await expect(defineType({ id: 'x', class: 'file', fields: {} }, {}))
      .rejects.toThrow(/Organization context required/);
  });

  it('never persists a declaration whose full-view compile fails', async () => {
    // Regression: the write used to upsert before compiling, so a failing
    // redefinition replaced the valid stored declaration and wedged every
    // later write in the org (each compiles the same broken view).
    const { countInstancesOfType } = await import('../instances/count.js');
    countInstancesOfType.mockResolvedValueOnce(0);
    const storedGadget = { id: 'gadget', name: 'Gadget', class: 'file', scope: 'org', organizationId: ORG, version: 2,
      fields: { code: { base: 'string', identifier: true } } };
    repository.findByTypeId.mockResolvedValue(storedGadget);
    repository.listByOrganization.mockResolvedValue([storedGadget]);
    await expect(defineType(
      { id: 'gadget', name: 'Gadget', class: 'file', fields: { code: { base: 'string', identifier: true }, serial: { base: 'string', identifier: true } } },
      { organizationId: ORG }
    )).rejects.toThrow(/exactly one field must carry the identifier flag/);
    expect(repository.upsertByTypeId).not.toHaveBeenCalled();

    countInstancesOfType.mockResolvedValueOnce(0);
    await expect(defineType(
      { id: 'gadget', name: 'Gadget', class: 'file', fields: { code: { base: 'string', identifier: true } }, edges: { children: { parts: { types: ['missing-child'] } } } },
      { organizationId: ORG }
    )).rejects.toThrow(/may not declare lineage children/);
    expect(repository.upsertByTypeId).not.toHaveBeenCalled();
  });

  it('repairs a historically stored invalid declaration without a migration', async () => {
    // The org view holds a file class with children edges (stored by the
    // old persist-before-compile order) WITH live instances: the corrected
    // redefinition must land freely — the diff never protected a
    // declaration that could not compile.
    const { countInstancesOfType } = await import('../instances/count.js');
    countInstancesOfType.mockResolvedValue(4);
    const broken = { id: 'yu', class: 'file', scope: 'org', organizationId: ORG, version: 1,
      fields: { note: { base: 'string', identifier: true } },
      edges: { children: { parts: { types: ['t-missing-child'] } } } };
    repository.findByTypeId.mockResolvedValue(broken);
    repository.listByOrganization.mockResolvedValue([broken]);
    const stored = await defineType(
      { id: 'yu', class: 'file', fields: { note: { base: 'string', identifier: true } } },
      { organizationId: ORG }
    );
    expect(stored.version).toBe(2);
    expect(stored.edges).toEqual({});
    expect(repository.upsertByTypeId).toHaveBeenCalled();
  });

  it('stores valid writes beside a broken stored declaration; refuses only errors the write introduces', async () => {
    // The repair sequence an org in the wild hits: a broken stored type
    // (obligation-invalid) poisons the whole-view compile, but that must
    // not block OTHER valid writes — the write gate refuses only the
    // errors the candidate itself introduces.
    const broken = { id: 'yu', class: 'file', scope: 'org', organizationId: ORG, version: 1,
      fields: { note: { base: 'string', identifier: true } },
      edges: { children: { parts: { types: ['t-child-1'] } } } };
    repository.listByOrganization.mockResolvedValue([broken]);
    repository.findByTypeId.mockImplementation(async (orgId, typeId) => (
      typeId === 'yu' ? broken : null
    ));

    // A valid new type lands even though the stored view carries YU's
    // obligation error.
    const child = await defineType(
      { id: 't-child-1', name: 'Child', class: 'file', fields: { note: { base: 'string', identifier: true } } },
      { organizationId: ORG }
    );
    expect(child.id).toBe('t-child-1');
    expect(repository.upsertByTypeId).toHaveBeenCalled();

    // A candidate that introduces its OWN error is still refused.
    repository.upsertByTypeId.mockClear();
    await expect(defineType(
      { id: 't-empty-1', name: 'Empty', class: 'file', fields: { code: { base: 'string', identifier: true }, serial: { base: 'string', identifier: true } } },
      { organizationId: ORG }
    )).rejects.toThrow(/exactly one field must carry the identifier flag/);
    expect(repository.upsertByTypeId).not.toHaveBeenCalled();
  });

  it('refuses shadowing a system type', async () => {
    await expect(defineType(
      { id: 'xlsx-workbook', class: 'file', fields: { rogue: { base: 'string' } } },
      { organizationId: ORG }
    )).rejects.toThrow(/shadows a system type/);
  });

  it('deletes org types, refuses system types', async () => {
    await expect(removeType('xlsx-workbook', { organizationId: ORG })).rejects.toThrow(/System types/);
    repository.listByOrganization.mockResolvedValue([
      { id: 'widget', class: 'file', scope: 'org', organizationId: ORG, version: 1, fields: {} }
    ]);
    countInstancesOfType.mockResolvedValueOnce(0);
    const result = await removeType('widget', { organizationId: ORG });
    expect(result.removed).toBe(true);
    expect(result.abandoned).toBeNull();
    expect(repository.deleteByTypeId).toHaveBeenCalledWith(ORG, 'widget');
  });

  it('refuses deleting a type with living instances or binding processes (409 + blast radius)', async () => {
    repository.listByOrganization.mockResolvedValue([
      { id: 'widget', class: 'file', scope: 'org', organizationId: ORG, version: 1, fields: {} }
    ]);
    countInstancesOfType.mockResolvedValueOnce(3);
    findTypeReferences.mockResolvedValueOnce([
      { id: 'pd-1', name: 'Production', status: 'ACTIVE' },
      { id: 'pd-2', name: 'Draft flow', status: 'DRAFT' }
    ]);
    const error = await removeType('widget', { organizationId: ORG }).catch(e => e);
    expect(error.statusCode).toBe(409);
    expect(error.data).toMatchObject({
      instances: 3,
      boundBy: expect.arrayContaining([expect.objectContaining({ id: 'pd-1', name: 'Production' })])
    });
    expect(error.message).toContain('3 persisted instance(s)');
    expect(error.message).toContain('Production');
    expect(repository.deleteByTypeId).not.toHaveBeenCalled();

    // Binder-only blast radius also refuses.
    countInstancesOfType.mockResolvedValueOnce(0);
    findTypeReferences.mockResolvedValueOnce([{ id: 'pd-1', name: 'Production', status: 'ACTIVE' }]);
    const binderError = await removeType('widget', { organizationId: ORG }).catch(e => e);
    expect(binderError.statusCode).toBe(409);
    expect(repository.deleteByTypeId).not.toHaveBeenCalled();
  });

  it('abandons the blast radius when explicitly confirmed and records the ceremony', async () => {
    repository.listByOrganization.mockResolvedValue([
      { id: 'widget', class: 'file', scope: 'org', organizationId: ORG, version: 1, fields: {} }
    ]);
    countInstancesOfType.mockResolvedValueOnce(7);
    findTypeReferences.mockResolvedValueOnce([{ id: 'pd-1', name: 'Production', status: 'ACTIVE' }]);
    const result = await removeType('widget', { organizationId: ORG, actor: 'user-1', abandon: true });
    expect(result.removed).toBe(true);
    expect(result.abandoned).toMatchObject({ instances: 7, boundBy: 1, actor: 'user-1' });
    expect(result.abandoned.at).toBeTruthy();
    expect(repository.deleteByTypeId).toHaveBeenCalledWith(ORG, 'widget');
  });

  it('exposes a registry for downstream runtimes', async () => {
    const registry = await compileRegistryForOrganization(ORG);
    expect(registry.getType('xlsx-workbook')).toBeTruthy();
    expect(registry.getType('xlsx-workbook', 'other-org')?.scope).toBe('system');
  });
});
