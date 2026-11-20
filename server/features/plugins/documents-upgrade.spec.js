// The Documents listing upgrade acceptance (TODO plugin-review): an
// installation carrying the previous declaration version moves to the
// current catalog listing through the plugins feature service's explicit
// diff-plus-migration apply — preview blockers, the persisted snapshot, and
// the graph-node gate over the upgraded pin. The synthetic installs model
// the v33 endpoint-era snapshot (seven endpoint-mode services, no
// documents-server runtime, no vendored server dependencies) and the v34
// pin the optionality fixes superseded.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../instances/index.js', () => ({ runOrganizationChange: vi.fn(async (_organizationId, _metadata, mutate) => await mutate()) }));
vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));
vi.mock('../instances/count.js', () => ({ countInstancesOfType: vi.fn(async () => 0) }));
vi.mock('~/server/db/mongo', () => ({
  connectDB: vi.fn(async () => ({
    collection: () => ({ updateMany: vi.fn(async () => ({ modifiedCount: 0 })), updateOne: vi.fn(async () => {}) })
  }))
}));
vi.mock('../instances/migrations.js', () => ({
  applyTypeMigrationSteps: vi.fn(async () => ({ appliedAt: '2026-11-20T00:00:00.000Z', actor: 'user-1', counts: {}, failures: [] }))
}));
vi.mock('../process-definitions/service.js', () => ({ findTypeReferences: vi.fn(async () => []), resolveRunActor: vi.fn(async auth => auth) }));
vi.mock('../instance-events/service.js', () => ({ publishOrgContractChanged: vi.fn() }));
vi.mock('../instances/service.js', () => ({
  invalidateInstanceDeclarations: vi.fn(),
  instanceServiceResolver: vi.fn(() => ({ getById: vi.fn(async () => null) }))
}));
vi.mock('../files/service.js', () => ({
  getFileBuffer: vi.fn(async () => Buffer.from('payload')),
  contentHash: vi.fn(() => 'sha256:abc')
}));
vi.mock('../../utils/auth-helpers.js', () => ({ hasPermission: vi.fn(() => true) }));
vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async () => null),
  listByOrganization: vi.fn(async () => []),
  upsertByTypeId: vi.fn(),
  deleteByTypeId: vi.fn()
}));
vi.mock('./repository.js', () => ({
  findInstall: vi.fn(async () => null),
  listInstallsByOrganization: vi.fn(async () => []),
  listDeclarationsByOrganization: vi.fn(async () => []),
  findCatalogByPluginId: vi.fn(async () => null),
  updateInstallSnapshot: vi.fn(),
  materializePluginAssets: vi.fn(async () => ({ count: 0, assets: [] }))
}));

import * as repository from './repository.js';
import techDrawingListing from '../../../workers/tech-drawing/listing.json';
import documentsListing from '../../../workers/documents/listing.json';
import {
  upgradePreview,
  applyUpgrade,
  resolveInstalledGraphNodeDefinition,
  listInstalledGraphNodeDefinitions
} from './service.js';

const ORG = 'org-1';
const AUTH = { userId: 'user-1', organizationId: ORG };

// applyUpgrade writes through updateInstallSnapshot; the harness serves
// the persisted snapshot back through findInstall so post-apply gate
// checks read the upgraded pin.
let appliedInstall = null;
repository.updateInstallSnapshot.mockImplementation(async (organizationId, pluginId, snapshot) => {
  appliedInstall = {
    organizationId,
    pluginId,
    name: documentsListing.name,
    ...snapshot
  };
});

const SERVER_RUNTIME_DEPENDENCIES = ['pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist/legacy/build/pdf.mjs', 'marked'];
const ENDPOINT_MIGRATED = ['text', 'table-rows', 'table-cells', 'fill', 'render-pdf', 'render-report-pdf', 'render-document-pdf'];

// The v33 pin: the seven services the endpoint executor used to serve,
// the shared runtime alone, and the pre-vendoring dependency set.
function documentsInstallV33() {
  const services = documentsListing.declarations.services.map(service => (
    ENDPOINT_MIGRATED.includes(service.id)
      ? (() => {
          const endpoint = { ...service };
          delete endpoint.execution;
          endpoint.mode = 'endpoint';
          if (['text', 'table-rows', 'table-cells', 'render-report-pdf'].includes(service.id)) endpoint.cache = 'deterministic';
          return endpoint;
        })()
      : service
  ));
  return {
    organizationId: ORG,
    pluginId: 'documents',
    name: documentsListing.name,
    version: '33',
    requires: documentsListing.requires,
    declarations: {
      types: documentsListing.declarations.types,
      editors: documentsListing.declarations.editors,
      surfaces: documentsListing.declarations.surfaces,
      previews: documentsListing.previews,
      previewChannels: documentsListing.previewChannels,
      starterConstructs: documentsListing.starterConstructs,
      constructions: documentsListing.constructions,
      dependencies: documentsListing.declarations.dependencies
        .filter(dependency => !SERVER_RUNTIME_DEPENDENCIES.includes(dependency.name)),
      runtimes: documentsListing.declarations.runtimes.filter(runtime => runtime.id === 'documents-shared')
    },
    services,
    executorOrigin: 'http://documents-executor:8791'
  };
}

// The v34 pin: the current declaration layer with the two optionality
// fixes the v35 listing delivers still unfixed.
function documentsInstallV34() {
  const required = fields => Object.fromEntries(Object.entries(fields)
    .map(([key, field]) => [key, key === 'name' || key === 'title' || key === 'sectionTitle' || key === 'rows'
      ? (() => { const strict = { ...field }; delete strict.nullable; return strict; })()
      : field]));
  const services = documentsListing.declarations.services.map(service => {
    if (service.id === 'render-report-pdf') return { ...service, signature: { ...service.signature, input: { ...service.signature.input, fields: required(service.signature.input.fields) } } };
    if (service.id === 'compose-report') return { ...service, signature: { ...service.signature, input: { ...service.signature.input, fields: required(service.signature.input.fields) } } };
    return service;
  });
  return { ...documentsInstallV33(), version: '34', executorOrigin: null, services: documentsListing.declarations.services.map(service => services.find(item => item.id === service.id) || service) };
}

const techDrawingInstall = {
  organizationId: ORG,
  pluginId: 'tech-drawing',
  name: techDrawingListing.name,
  version: techDrawingListing.version,
  declarations: { types: techDrawingListing.declarations.types },
  services: []
};

function stageCatalogWith(install) {
  appliedInstall = null;
  repository.findInstall.mockImplementation(async (organizationId, pluginId) => {
    if (String(organizationId) !== ORG) return null;
    if (pluginId === 'documents') return appliedInstall || install;
    return null;
  });
  repository.listInstallsByOrganization.mockImplementation(async organizationId => (
    String(organizationId) === ORG ? [appliedInstall || install, techDrawingInstall] : []
  ));
  repository.findCatalogByPluginId.mockImplementation(async pluginId => (
    pluginId === 'documents' ? documentsListing : null
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Documents listing upgrade (v33/v34 installs → current catalog)', () => {
  it('previews a v33 install as a clean service-layer migration with no type blockers', async () => {
    stageCatalogWith(documentsInstallV33());
    const plan = await upgradePreview({ organizationId: ORG, pluginId: 'documents', auth: AUTH });
    expect(plan).toMatchObject({ pluginId: 'documents', from: '33', to: documentsListing.version });
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.renamed).toEqual([]);
    expect(plan.blocked).toEqual([]);
    for (const change of plan.changed) {
      expect(change.breaking).toEqual([]);
    }
  });

  it('applies the v33 upgrade as the managed snapshot and resolves graph nodes over the new pin', async () => {
    stageCatalogWith(documentsInstallV33());
    const result = await applyUpgrade({ organizationId: ORG, pluginId: 'documents', auth: AUTH });
    expect(result).toMatchObject({ pluginId: 'documents', version: documentsListing.version });

    const persisted = repository.updateInstallSnapshot.mock.calls[0][2];
    expect(persisted.version).toBe(documentsListing.version);
    expect(persisted.executorOrigin).toBe('http://documents-executor:8791');
    expect(persisted.services.filter(service => service.mode === 'endpoint')).toEqual([]);
    for (const id of ENDPOINT_MIGRATED) {
      const service = persisted.services.find(item => item.id === id);
      expect(service.execution, id).toMatchObject({ kind: 'pure', targets: ['server'] });
      expect(service.execution.runtime, id).toMatch(/documents-(shared|server)/);
    }
    expect(persisted.declarations.runtimes.map(runtime => runtime.id)).toEqual(['documents-shared', 'documents-server']);
    for (const name of SERVER_RUNTIME_DEPENDENCIES) {
      expect(persisted.declarations.dependencies, name).toContainEqual(expect.objectContaining({ name }));
    }

    const pdfExport = await resolveInstalledGraphNodeDefinition({
      provider: 'plugin.documents', id: 'render-document-pdf', version: '1', auth: AUTH
    });
    expect(pdfExport.packagePin).toEqual({
      pluginId: 'documents', version: documentsListing.version, runtimeId: 'documents-server', operationId: 'render-document-pdf'
    });
    await expect(resolveInstalledGraphNodeDefinition({
      provider: 'plugin.documents', id: 'fill', version: '1', auth: AUTH
    })).rejects.toMatchObject({ statusCode: 409 });
    const definitions = await listInstalledGraphNodeDefinitions({ provider: 'plugin.documents', auth: AUTH });
    expect(definitions.map(definition => definition.id).sort()).toHaveLength(29);
  });

  it('delivers the v35 socket-optionality fixes to a v34 install through the apply', async () => {
    stageCatalogWith(documentsInstallV34());
    const plan = await upgradePreview({ organizationId: ORG, pluginId: 'documents', auth: AUTH });
    expect(plan).toMatchObject({ from: '34', to: documentsListing.version });
    expect(plan.blocked).toEqual([]);

    const result = await applyUpgrade({ organizationId: ORG, pluginId: 'documents', auth: AUTH });
    expect(result.version).toBe(documentsListing.version);

    const reportPdf = await resolveInstalledGraphNodeDefinition({
      provider: 'plugin.documents', id: 'render-report-pdf', version: '1', auth: AUTH
    });
    expect(reportPdf.inputs.find(port => port.id === 'name')).toMatchObject({ required: false });
    const composeReport = await resolveInstalledGraphNodeDefinition({
      provider: 'plugin.documents', id: 'compose-report', version: '1', auth: AUTH
    });
    for (const port of composeReport.inputs) {
      expect(port.required, port.id).toBe(false);
    }
  });
});
