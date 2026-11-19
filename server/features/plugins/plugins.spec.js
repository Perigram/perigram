import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import documentsListingV34 from '../../../workers/documents/listing.json';

vi.mock('../instances/index.js', () => ({ runOrganizationChange: vi.fn(async (_organizationId, _metadata, mutate) => await mutate()) }));
vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));
vi.mock('../instances/count.js', () => ({ countInstancesOfType: vi.fn(async () => 0) }));
vi.mock('~/server/db/mongo', () => {
  const updates = [];
  const makeDb = () => ({
    collection: vi.fn(() => ({
      updateMany: vi.fn(async (filter, update) => {
        updates.push({ kind: 'many', filter, update });
        return { modifiedCount: filter.type === 'coating' ? 1 : 0 };
      }),
      updateOne: vi.fn(async (filter, update) => {
        updates.push({ kind: 'one', filter, update });
      }),
      find: () => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            _id: 'doc-with-ref',
            organizationId: 'org-1',
            relations: { template: { type: 'coating', id: 'c-1' }, other: [{ type: 'primer', id: 'p-1' }] }
          };
        }
      })
    })),
    get updates() { return updates; }
  });
  const db = makeDb();
  return { connectDB: vi.fn(async () => db), __db: db };
});
vi.mock('../instances/migrations.js', () => ({
  applyTypeMigrationSteps: vi.fn(async () => ({ appliedAt: '2026-10-08T00:00:00.000Z', actor: 'user-1', counts: {}, failures: [] }))
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

vi.mock('../../core/tasks/service.js', () => ({
  enqueueTask: vi.fn(async (taskId, input, auth, options) => ({
    _id: 'run-1',
    taskId,
    input,
    workerType: options?.workerType,
    status: 'QUEUED'
  })),
  getTaskRunById: vi.fn(async () => ({
    _id: 'run-1',
    status: 'SUCCEEDED',
    output: { ok: true, data: { output: { value: 'managed-result' } } }
  })),
  cancelTaskRun: vi.fn(async () => ({ status: 'CANCELLED' }))
}));

vi.mock('./repository.js', () => ({
  listCatalog: vi.fn(async () => []),
  findCatalogByPluginId: vi.fn(async () => null),
  upsertCatalogListing: vi.fn(),
  deleteCatalogListing: vi.fn(),
  countInstallsByPluginId: vi.fn(async () => 0),
  listInstallsByOrganization: vi.fn(async () => []),
  findInstall: vi.fn(async () => null),
  findInstallByConnectorToken: vi.fn(async () => null),
  createInstall: vi.fn(async () => 'install-1'),
  deleteInstall: vi.fn(),
  setConnectorToken: vi.fn(),
  updateInstallSnapshot: vi.fn(),
  findCachedServiceResult: vi.fn(async () => null),
  storeCachedServiceResult: vi.fn(),
  storePluginAsset: vi.fn(async ({ pluginId, version, path }) => ({ pluginId, version, path, id: 'asset-1', bytes: 1 })),
  findPluginAssetMeta: vi.fn(async () => null),
  readPluginAsset: vi.fn(async () => Buffer.alloc(0)),
  deletePluginAssets: vi.fn(async () => 0),
  materializePluginAssets: vi.fn(async () => ({ count: 0, assets: [] })),
  findOrganizationPluginAssetMeta: vi.fn(async () => null),
  readOrganizationPluginAsset: vi.fn(async () => Buffer.alloc(0)),
  deleteOrganizationPluginAssets: vi.fn(async () => 0),
  updateSettings: vi.fn(),
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null),
}));

import * as repository from './repository.js';
import { __db } from '~/server/db/mongo';
import * as typeStore from '../cts-types/repository.js';
import {
  install, installFromCatalog, uninstall, listInstalled, listCatalog, servicesForOrganization, serviceModeOf,
  projectedServicesForOrganization, projectedDomainsForOrganization, commandDefinitionFor, executeConnectorService, invokeEndpointValueService,
  regenerateConnectorToken, upgradePreview, applyUpgrade, publishListing,
  retractListing, settingsFor, updateSettings, publishPluginAsset,
  fetchSurfaceModule, starterConstructsForOrganization, resolveProjectionValue, uninstallPreview, managedRuntimePackageForTask, resolveInstalledGraphNodeDefinition, listInstalledGraphNodeDefinitions, executeManagedGraphNode, invokePreviewValueService, invokeConstructionValueService
} from './service.js';
import { enqueueTask, getTaskRunById, cancelTaskRun } from '../../core/tasks/service.js';
import { countInstancesOfType } from '../instances/count.js';
import { applyTypeMigrationSteps } from '../instances/migrations.js';
import { invalidateInstanceDeclarations, instanceServiceResolver } from '../instances/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import { resolveRunActor } from '../process-definitions/service.js';
import * as filesService from '../files/service.js';

const ORG = 'org-1';
const AUTH = { userId: 'user-1', organizationId: ORG };

const coatingListing = {
  pluginId: 'coatings',
  name: 'Coatings',
  version: '2',
  declarations: {
    types: [
      { id: 'coating', class: 'item', name: 'Coating', fields: { code: { base: 'string', identifier: true } } }
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
  repository.materializePluginAssets.mockResolvedValue({ count: 0, assets: [] });
  getTaskRunById.mockResolvedValue({
    _id: 'run-1',
    status: 'SUCCEEDED',
    output: { ok: true, data: { output: { value: 'managed-result' } } }
  });
  cancelTaskRun.mockResolvedValue({ status: 'CANCELLED' });
  typeStore.findByTypeId.mockResolvedValue(null);
  typeStore.listByOrganization.mockResolvedValue([]);
});

describe('managed plugin runtime package loading', () => {
  // Parity pin (SPEC §30.12): the server derives installed graph node
  // definitions through the sdk normalizer — the same normalization the
  // browser session applies. Every port-contract fact the hand-rolled
  // derivation produced is asserted verbatim; the sdk vocabulary law
  // (lowercased/deduped keywords, sorted capabilities, frozen output) is
  // the one accepted canonicalization.
  it('derives the sdk-normalized contract without losing port semantics or the package pin', async () => {
    repository.findInstall.mockResolvedValue({
      pluginId: 'documents',
      version: '9',
      services: [{
        id: 'read-text-file',
        nodeVersion: '2',
        label: 'Read text file',
        description: 'Read a text file',
        palette: { group: 'document-sources', label: 'Document sources', keywords: ['File', 'text', 'text'] },
        signature: {
          input: { base: 'record', fields: {
            fileId: { base: 'string', label: 'File ID', semantic: { kind: 'documents.file-id' } },
            typeId: { base: 'string', nullable: true, label: 'File type' },
            rows: { base: 'list', itemType: { base: 'record' } }
          } },
          output: { base: 'json', kind: 'documents.file' }
        },
        execution: {
          runtime: 'documents-shared', targets: ['browser', 'server'], kind: 'read',
          capabilities: ['files.read'], deterministic: true, idempotent: true
        }
      }],
      declarations: {
        runtimes: [{ id: 'documents-shared', language: 'javascript', targets: ['browser', 'server'], entry: '/runtime.mjs' }]
      }
    });

    const definition = await resolveInstalledGraphNodeDefinition({
      provider: 'plugin.documents',
      id: 'read-text-file',
      version: '2',
      auth: AUTH
    });

    expect(definition).toMatchObject({
      provider: 'plugin.documents',
      id: 'read-text-file',
      version: '2',
      label: 'Read text file',
      description: 'Read a text file',
      palette: { group: 'document-sources', label: 'Document sources', keywords: ['file', 'text'] },
      inputs: [
        { id: 'fileId', label: 'File ID', shape: 'item', semantic: { base: 'string', kind: 'documents.file-id' }, required: true },
        { id: 'typeId', label: 'File type', shape: 'item', semantic: { base: 'string', nullable: true }, required: false },
        { id: 'rows', shape: 'list', semantic: { base: 'record' }, required: true }
      ],
      outputs: [{ id: 'value', shape: 'item', semantic: { base: 'json', kind: 'documents.file' }, required: true }],
      execution: { runtime: 'documents-shared', kind: 'read', targets: ['browser', 'server'], capabilities: ['files.read'], deterministic: true, idempotent: true },
      packagePin: { pluginId: 'documents', version: '9', runtimeId: 'documents-shared', operationId: 'read-text-file' }
    });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.inputs[0])).toBe(true);
  });

  it('resolves graph node definitions from the installed package snapshot', async () => {
    repository.findInstall.mockResolvedValue({
      pluginId: 'demo',
      version: '7',
      services: [{
        id: 'transform',
        nodeVersion: '3',
        label: 'Transform',
        palette: { group: 'documents', label: 'Documents', keywords: ['format'] },
        signature: {
          input: { base: 'record', fields: {
            source: { base: 'string', label: 'Source' },
            options: { base: 'json', nullable: true, default: {} }
          } },
          output: { base: 'string', label: 'Text' }
        },
        execution: { runtime: 'javascript', targets: ['browser', 'server'], kind: 'pure', capabilities: [] }
      }],
      declarations: {
        runtimes: [{ id: 'javascript', language: 'javascript', targets: ['browser', 'server'], entry: '/runtime.mjs' }]
      }
    });

    const definition = await resolveInstalledGraphNodeDefinition({
      provider: 'plugin.demo',
      id: 'transform',
      version: '3',
      auth: AUTH
    });

    expect(repository.findInstall).toHaveBeenCalledWith(ORG, 'demo');
    expect(repository.findCatalogByPluginId).not.toHaveBeenCalled();
    expect(definition).toMatchObject({
      provider: 'plugin.demo',
      id: 'transform',
      version: '3',
      inputs: [
        { id: 'source', shape: 'item', semantic: { base: 'string' }, required: true },
        { id: 'options', shape: 'item', semantic: { base: 'json', nullable: true }, required: false, default: {} }
      ],
      outputs: [{ id: 'value', shape: 'item', semantic: { base: 'string' }, required: true }],
      execution: { runtime: 'javascript', kind: 'pure', targets: ['browser', 'server'] },
      packagePin: { pluginId: 'demo', version: '7', runtimeId: 'javascript', operationId: 'transform' }
    });
  });

  it('rejects graph node definitions that do not match the installed node version', async () => {
    repository.findInstall.mockResolvedValue({
      pluginId: 'demo',
      version: '7',
      services: [{
        id: 'transform',
        nodeVersion: '4',
        palette: { group: 'documents' },
        signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } },
        execution: { runtime: 'javascript', targets: ['server'], kind: 'pure' }
      }],
      declarations: { runtimes: [{ id: 'javascript', language: 'javascript', targets: ['server'] }] }
    });

    await expect(resolveInstalledGraphNodeDefinition({
      provider: 'plugin.demo', id: 'transform', version: '3', auth: AUTH
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('enumerates installed graph node definitions through the resolution gate, skipping refused services', async () => {
    const demoInstall = {
      pluginId: 'demo',
      version: '7',
      services: [
        {
          id: 'transform',
          nodeVersion: '3',
          label: 'Transform',
          palette: { group: 'documents' },
          signature: { input: { base: 'record', fields: { source: { base: 'string' } } }, output: { base: 'string' } },
          execution: { runtime: 'javascript', targets: ['browser', 'server'], kind: 'pure', capabilities: [] }
        },
        {
          id: 'browser-only',
          palette: { group: 'documents' },
          signature: { input: { base: 'json' }, output: { base: 'json' } },
          execution: { runtime: 'javascript', targets: ['browser'], kind: 'pure' }
        }
      ],
      declarations: { runtimes: [{ id: 'javascript', language: 'javascript', targets: ['browser', 'server'] }] }
    };
    repository.listInstallsByOrganization.mockResolvedValue([demoInstall, { pluginId: 'other', version: '1', services: [], declarations: {} }]);
    repository.findInstall.mockResolvedValue(demoInstall);

    const definitions = await listInstalledGraphNodeDefinitions({ auth: AUTH });
    expect(definitions.map(definition => `${definition.provider}/${definition.id}@${definition.version}`))
      .toEqual(['plugin.demo/transform@3']);
  });

  it('propagates enumeration actor refusals and honors the provider filter', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([
      {
        pluginId: 'demo',
        version: '7',
        services: [{
          id: 'transform',
          nodeVersion: '1',
          palette: { group: 'documents' },
          signature: { input: { base: 'json' }, output: { base: 'json' } },
          execution: { runtime: 'javascript', targets: ['server'], kind: 'pure' }
        }],
        declarations: { runtimes: [{ id: 'javascript', language: 'javascript', targets: ['server'] }] }
      }
    ]);

    const narrowed = await listInstalledGraphNodeDefinitions({ provider: 'plugin.other', auth: AUTH });
    expect(narrowed).toEqual([]);
    expect(repository.findInstall).not.toHaveBeenCalled();

    const { resolveRunActor } = await import('../process-definitions/service.js');
    resolveRunActor.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { statusCode: 403 }));
    await expect(listInstalledGraphNodeDefinitions({ auth: AUTH })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('executes graph nodes through the pinned shared runtime task worker', async () => {
    repository.findInstall.mockResolvedValue({
      pluginId: 'demo',
      version: '7',
      services: [{
        id: 'transform',
        nodeVersion: '3',
        signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } },
        execution: { runtime: 'javascript', targets: ['server'], kind: 'pure' }
      }],
      declarations: {
        runtimes: [{ id: 'javascript', language: 'javascript', targets: ['server'], entry: '/runtime.mjs' }]
      }
    });
    const capabilityReadSet = {
      consistency: 'snapshot',
      snapshotId: 'snapshot-graph-node',
      organizationSequenceStart: 12,
      organizationSequenceEnd: 12,
      instances: [{
        typeId: 'part', instanceId: 'part-1', revision: '4',
        updatedAt: '2026-11-18T08:00:00Z', organizationId: ORG
      }],
      relations: [],
      queries: [{
        typeId: 'part', organizationId: ORG,
        query: { typeId: 'part', instanceId: 'part-1' },
        resultIds: ['part-1'], observedTotal: 1, sequence: 12
      }]
    };
    getTaskRunById.mockResolvedValue({
      _id: 'run-1',
      status: 'SUCCEEDED',
      hostCapabilityEvidence: [{
        name: 'organization.instances.read',
        input: { typeId: 'part', instanceId: 'part-1' },
        readSet: capabilityReadSet
      }, {
        name: 'files.read',
        input: { fileId: 'file-2' },
        organizationId: null,
        contentHash: 'sha256:file'
      }],
      output: { ok: true, data: {
        output: { value: 'managed-result' },
        capabilityEvidence: [{
          name: 'organization.instances.read',
          input: { typeId: 'part', instanceId: 'part-1' },
          readSet: capabilityReadSet
        }, {
          name: 'files.read',
          input: { fileId: 'file-2' },
          organizationId: null,
          contentHash: 'sha256:file'
        }]
      } }
    });
    const definition = {
      provider: 'plugin.demo',
      id: 'transform',
      version: '3',
      execution: { kind: 'pure' },
      packagePin: { pluginId: 'demo', version: '7', runtimeId: 'javascript', operationId: 'transform' }
    };
    const invocationPath = [{ graphId: 'parent', graphRevision: 'r1', nodeId: 'node-a' }];
    const capabilityEvidence = [];
    const nodeInvocations = [];
    const readSetRecorder = {
      setConsistency: vi.fn(),
      recordInstance: vi.fn(),
      recordRelation: vi.fn(),
      recordQuery: vi.fn(),
      recordFile: vi.fn()
    };

    const result = await executeManagedGraphNode(definition, {
      node: { id: 'node-a' },
      config: { mode: 'compact' },
      inputs: { source: 'hello' },
      invocationPath,
      context: {
        executionId: 'execution-1',
        nodeInvocations,
        capabilityEvidence,
        readSet: readSetRecorder
      }
    }, AUTH);

    expect(result).toEqual({ value: 'managed-result' });
    expect(enqueueTask).toHaveBeenCalledWith('plugin.demo.transform', expect.objectContaining({
      parameters: { value: expect.objectContaining({
        pluginId: 'demo',
        version: '7',
        runtimeId: 'javascript',
        operationId: 'transform',
        input: expect.objectContaining({
          mode: 'preview',
          config: { mode: 'compact' },
          inputs: { source: 'hello' },
          executionId: 'execution-1',
          invocationPath
        })
      }) }
    }), expect.objectContaining({ organizationId: ORG }), expect.objectContaining({
      workerType: 'plugin-runtime',
      maxAttempts: 1,
      idempotencyKey: expect.stringMatching(/^graph-node:execution-1:/)
    }));
    expect(repository.findInstall).toHaveBeenCalledWith(ORG, 'demo');
    expect(capabilityEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'organization.instances.read',
        nodeId: 'node-a',
        verified: true,
        input: { typeId: 'part', instanceId: 'part-1' },
        packagePin: expect.objectContaining({ pluginId: 'demo', version: '7' })
      }),
      expect.objectContaining({
        name: 'files.read',
        nodeId: 'node-a',
        verified: true,
        input: { fileId: 'file-2' },
        contentHash: 'sha256:file'
      })
    ]));
    expect(readSetRecorder.setConsistency).toHaveBeenCalledWith({
      consistency: 'snapshot',
      snapshotId: 'snapshot-graph-node',
      organizationSequenceStart: 12,
      organizationSequenceEnd: 12
    });
    expect(readSetRecorder.recordInstance).toHaveBeenCalledWith(capabilityReadSet.instances[0]);
    expect(readSetRecorder.recordQuery).toHaveBeenCalledWith(capabilityReadSet.queries[0]);
    expect(readSetRecorder.recordFile).toHaveBeenCalledWith({
      fileId: 'file-2',
      contentHash: 'sha256:file',
      organizationId: null
    });
    expect(nodeInvocations[0].capabilities).toEqual(['organization.instances.read', 'files.read']);
  });

  it('passes worker capability claims through unverified and merges nothing without a host journal', async () => {
    repository.findInstall.mockResolvedValue({
      pluginId: 'demo',
      version: '7',
      services: [{
        id: 'transform',
        nodeVersion: '3',
        signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } },
        execution: { runtime: 'javascript', targets: ['server'], kind: 'pure' }
      }],
      declarations: {
        runtimes: [{ id: 'javascript', language: 'javascript', targets: ['server'], entry: '/runtime.mjs' }]
      }
    });
    const claim = {
      name: 'files.read',
      input: { fileId: 'file-2' },
      organizationId: null,
      contentHash: 'sha256:file'
    };
    getTaskRunById.mockResolvedValue({
      _id: 'run-1',
      status: 'SUCCEEDED',
      output: { ok: true, data: { output: { value: 'managed-result' }, capabilityEvidence: [claim] } }
    });
    const capabilityEvidence = [];
    const nodeInvocations = [];
    const readSetRecorder = {
      setConsistency: vi.fn(),
      recordInstance: vi.fn(),
      recordRelation: vi.fn(),
      recordQuery: vi.fn(),
      recordFile: vi.fn()
    };

    await executeManagedGraphNode({
      provider: 'plugin.demo',
      id: 'transform',
      version: '3',
      execution: { kind: 'pure' },
      packagePin: { pluginId: 'demo', version: '7', runtimeId: 'javascript', operationId: 'transform' }
    }, {
      node: { id: 'node-a' },
      invocationPath: [],
      context: { executionId: 'execution-1', nodeInvocations, capabilityEvidence, readSet: readSetRecorder }
    }, AUTH);

    expect(capabilityEvidence).toHaveLength(1);
    expect(capabilityEvidence[0]).toMatchObject({ name: 'files.read', nodeId: 'node-a', input: { fileId: 'file-2' } });
    expect(capabilityEvidence[0]).not.toHaveProperty('verified');
    expect(readSetRecorder.recordFile).not.toHaveBeenCalled();
    expect(readSetRecorder.setConsistency).not.toHaveBeenCalled();
    expect(nodeInvocations[0].capabilities).toEqual(['files.read']);
  });

  it('refuses to dispatch non-preview execution kinds', async () => {
    repository.findInstall.mockResolvedValue({
      pluginId: 'demo',
      version: '7',
      services: [{
        id: 'propose',
        nodeVersion: '1',
        signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } },
        execution: { runtime: 'javascript', targets: ['server'], kind: 'proposal' }
      }],
      declarations: {
        runtimes: [{ id: 'javascript', language: 'javascript', targets: ['server'], entry: '/runtime.mjs' }]
      }
    });
    await expect(executeManagedGraphNode({
      provider: 'plugin.demo',
      id: 'propose',
      version: '1',
      execution: { kind: 'proposal' },
      packagePin: { pluginId: 'demo', version: '7', runtimeId: 'javascript', operationId: 'propose' }
    }, { context: {} }, AUTH)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Graph preview cannot execute proposal operation propose'
    });
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it('cancels an active worker task when the graph signal aborts', async () => {
    const controller = new AbortController();
    repository.findInstall.mockResolvedValue({
      pluginId: 'demo',
      version: '7',
      services: [{
        id: 'transform',
        nodeVersion: '3',
        signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } },
        execution: { runtime: 'javascript', targets: ['server'], kind: 'pure' }
      }],
      declarations: {
        runtimes: [{ id: 'javascript', language: 'javascript', targets: ['server'], entry: '/runtime.mjs' }]
      }
    });
    getTaskRunById.mockImplementation(async () => {
      controller.abort('graph cancelled');
      return { _id: 'run-1', status: 'RUNNING' };
    });

    await expect(executeManagedGraphNode({
      provider: 'plugin.demo',
      id: 'transform',
      version: '3',
      execution: { kind: 'pure' },
      packagePin: { pluginId: 'demo', version: '7', runtimeId: 'javascript', operationId: 'transform' }
    }, { context: { executionId: 'execution-1', signal: controller.signal } }, AUTH))
      .rejects.toMatchObject({ name: 'AbortError', code: 'PLUGIN_EXECUTION_ABORTED' });

    expect(cancelTaskRun).toHaveBeenCalledWith('run-1', 'Graph execution was cancelled');
  });

  it('does not enqueue a managed graph node after cancellation', async () => {
    const controller = new AbortController();
    controller.abort('cancelled');
    await expect(executeManagedGraphNode({
      provider: 'plugin.demo',
      id: 'transform',
      version: '3',
      execution: { kind: 'pure' },
      packagePin: { pluginId: 'demo', version: '7', runtimeId: 'javascript', operationId: 'transform' }
    }, { context: { signal: controller.signal } }, AUTH)).rejects.toMatchObject({
      name: 'AbortError',
      code: 'PLUGIN_EXECUTION_ABORTED'
    });
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it('loads only the pinned organization package and verifies its asset digest', async () => {
    repository.findInstall.mockResolvedValue({
      pluginId: 'demo',
      version: '2',
      services: [{ id: 'run', execution: { runtime: 'javascript', targets: ['server'] } }],
      declarations: {
        runtimes: [{ id: 'javascript', language: 'javascript', targets: ['server'], entry: '/runtime.mjs' }],
        dependencies: []
      },
      packageAssets: { assets: [{ path: 'runtime.mjs', contentHash: 'sha256:abc' }] }
    });
    repository.findOrganizationPluginAssetMeta.mockResolvedValue({
      id: 'asset-1', contentType: 'text/javascript', contentHash: 'sha256:abc'
    });
    repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.from('payload'));

    const result = await managedRuntimePackageForTask({
      taskId: 'plugin.demo.run',
      auth: { organizationId: ORG, userId: AUTH.userId },
      input: { parameters: { value: {
        pluginId: 'demo', version: '2', runtimeId: 'javascript', operationId: 'run', input: { value: 7 }
      } } }
    });

    expect(result.package).toMatchObject({
      pluginId: 'demo',
      version: '2',
      operationId: 'run',
      input: { value: 7 },
      runtime: { entry: '/runtime.mjs' },
      assets: [{ path: 'runtime.mjs', contentHash: 'sha256:abc' }]
    });
    expect(repository.findInstall).toHaveBeenCalledWith(ORG, 'demo');
    expect(repository.readOrganizationPluginAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-1' }));
  });

  it('rejects package loading when the installed version changed', async () => {
    repository.findInstall.mockResolvedValue({ pluginId: 'demo', version: '3' });
    await expect(managedRuntimePackageForTask({
      taskId: 'plugin.demo.run',
      auth: { organizationId: ORG },
      input: { parameters: { value: {
        pluginId: 'demo', version: '2', runtimeId: 'javascript', operationId: 'run'
      } } }
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('plugin installs', () => {
  it('classifies managed execution independently from external connector modes', () => {
    expect(serviceModeOf({ execution: { runtime: 'javascript', targets: ['server'], kind: 'pure' } })).toBe('managed');
    expect(serviceModeOf({ mode: 'endpoint' })).toBe('endpoint');
    expect(serviceModeOf({ mode: 'local' })).toBe('local');
    expect(serviceModeOf({})).toBe('claim');
  });

  it('queues managed package operations on the shared platform runtime worker', async () => {
    repository.findInstall.mockResolvedValue({
      ...coatingInstall,
      declarations: {
        ...coatingInstall.declarations,
        runtimes: [{ id: 'javascript', language: 'javascript', version: '1', entry: '/runtime.mjs', targets: ['server'] }]
      },
      services: [{
        id: 'transform',
        signature: { input: { base: 'json' }, output: { base: 'json' } },
        execution: { runtime: 'javascript', targets: ['server'], kind: 'pure' }
      }]
    });
    const result = await executeConnectorService({ id: 'plugin.coatings.transform' }, { parameters: { value: 1 }, auth: AUTH });
    expect(result.tasks).toHaveLength(1);
    expect(enqueueTask).toHaveBeenCalledWith('plugin.coatings.transform', {
      parameters: { value: expect.objectContaining({ pluginId: 'coatings', runtimeId: 'javascript', operationId: 'transform', input: { value: 1 } }) }
    }, expect.objectContaining({ organizationId: ORG }), expect.objectContaining({ workerType: 'plugin-runtime' }));
  });

  it('exposes managed services as runtime operations with no endpoint settings', async () => {
    repository.findInstall.mockResolvedValue({
      ...coatingInstall,
      packageAssets: { count: 1 },
      declarations: { ...coatingInstall.declarations, runtimes: [{ id: 'javascript' }] },
      services: [{
        id: 'transform',
        signature: { input: { base: 'json' }, output: { base: 'json' } },
        execution: { runtime: 'javascript', targets: ['browser', 'server'], kind: 'pure' }
      }]
    });
    const settings = await settingsFor({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(settings.services).toEqual([expect.objectContaining({ id: 'transform', mode: 'managed' })]);
    expect(settings.hasEndpointServices).toBe(false);
    expect(settings.authToken).toBeNull();
    expect(settings.executorOrigin).toBe('');
    expect(settings.surfaces).toBe(false);
    expect(settings.surfaceOrigin).toBeNull();
  });


  it('publishes a valid listing normalized through the contract', async () => {
    const valid = await publishListing(coatingListing);
    expect(valid).toMatchObject({ pluginId: 'coatings', version: '2', requires: [] });
    expect(repository.upsertCatalogListing).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'coatings',
      requires: [],
      declarations: expect.objectContaining({
        types: coatingListing.declarations.types,
        services: coatingListing.declarations.services,
        editors: []
      })
    }));
  });

  it('refuses to publish a listing the contract rejects', async () => {
    await expect(publishListing({ ...coatingListing, pluginId: 'Not A Slug' }))
      .rejects.toMatchObject({ message: expect.stringContaining('pluginId') });
    expect(repository.upsertCatalogListing).not.toHaveBeenCalled();
  });
  it('refuses packages that target an unavailable managed runtime', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        runtimes: [{ id: 'python', language: 'python', version: '1', entry: '/runtime.py', targets: ['browser'] }]
      }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Runtime language python is not available') });
    expect(repository.materializePluginAssets).not.toHaveBeenCalled();
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('verifies organization package digests before serving browser modules', async () => {
    repository.findInstall.mockResolvedValue({
      ...coatingInstall,
      packageAssets: { count: 1, assets: [{ path: 'runtime.mjs', contentHash: 'sha256:abc' }] }
    });
    repository.findOrganizationPluginAssetMeta.mockResolvedValue({ contentType: 'text/javascript' });
    repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.from('export default 1;'));
    const result = await fetchSurfaceModule({
      organizationId: ORG, pluginId: 'coatings', modulePath: 'runtime.mjs', auth: AUTH
    });
    expect(result.body.toString()).toBe('export default 1;');
    repository.findInstall.mockResolvedValue({
      ...coatingInstall,
      packageAssets: { count: 1, assets: [{ path: 'runtime.mjs', contentHash: 'sha256:wrong' }] }
    });
    await expect(fetchSurfaceModule({
      organizationId: ORG, pluginId: 'coatings', modulePath: 'runtime.mjs', auth: AUTH
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('materializes the pinned package into organization-owned data on install', async () => {
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
    const packageAssets = { count: 2, assets: [{ path: 'engine.mjs', contentHash: 'sha256:abc', bytes: 42 }] };
    repository.materializePluginAssets.mockResolvedValue(packageAssets);
    await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.materializePluginAssets).toHaveBeenCalledWith(ORG, 'coatings', '2');
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({ packageAssets }));
  });


  it('snapshots managed runtimes as organization-owned package declarations', async () => {
    const runtimeListing = {
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        runtimes: [{ id: 'javascript', language: 'javascript', version: '1', entry: '/runtime.mjs', targets: ['browser', 'server'] }],
        services: [{
          id: 'transform',
          signature: { input: { base: 'json' }, output: { base: 'json' } },
          execution: { runtime: 'javascript', targets: ['browser', 'server'], kind: 'pure', deterministic: true }
        }]
      }
    };
    repository.findCatalogByPluginId.mockResolvedValue(runtimeListing);
    repository.materializePluginAssets.mockResolvedValue({ count: 1, assets: [] });
    repository.findOrganizationPluginAssetMeta.mockResolvedValue({ id: 'runtime-asset' });
    await installFromCatalog({ organizationId: ORG, pluginId: 'coatings' });
    expect(repository.findOrganizationPluginAssetMeta).toHaveBeenCalledWith(ORG, 'coatings', '2', 'runtime.mjs');
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      declarations: expect.objectContaining({ runtimes: runtimeListing.declarations.runtimes }),
      services: runtimeListing.declarations.services,
      connectorToken: null
    }));
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
    repository.listInstallsByOrganization.mockResolvedValue([{ ...coatingInstall, pluginId: 'primers' }]);
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      requires: ['primers'],
      declarations: {
        ...coatingListing.declarations,
        types: [
          ...coatingListing.declarations.types,
          { id: 'coating-sheet', class: 'file', fields: { code: { base: 'string', identifier: true } } }
        ],
        editors: [{ type: 'coating-sheet', surface: 'coating-designer', modes: ['edit'] }],
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }]
      }
    });
    await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      declarations: expect.objectContaining({
        editors: [{ type: 'coating-sheet', surface: 'coating-designer', modes: ['edit'] }],
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }]
      }),
      requires: ['primers']
    }));
    repository.listInstallsByOrganization.mockResolvedValue([]);
  });

  it('snapshots declared preview channels into the install (SPEC §28)', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        surfaces: [
          { id: 'coating-preview', module: '/surfaces/coating-preview.mjs', surfaceContract: 1, kind: 'preview' }
        ],
        previewChannels: [{ id: 'coating-view', surface: 'coating-preview', label: 'Coating view' }]
      }
    });
    await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      declarations: expect.objectContaining({
        previewChannels: [{ id: 'coating-view', surface: 'coating-preview', label: 'Coating view' }]
      })
    }));
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
  });

  it('snapshots the client engine beside local-mode services (SPEC §20)', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        engine: { module: '/engine/index.mjs' },
        services: [{ id: 'spin', label: 'Spin', mode: 'local', signature: { input: { base: 'json' }, output: { base: 'json' } } }]
      }
    });
    await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      declarations: expect.objectContaining({ engine: { module: '/engine/index.mjs' } }),
      services: [expect.objectContaining({ id: 'spin', mode: 'local' })]
    }));
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
  });

  it('installs endpoint services with one provider-level executor origin', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        services: [
          { ...coatingListing.declarations.services[0], mode: 'endpoint' },
          { id: 'poll', label: 'Poll', signature: { input: { base: 'json' }, output: { base: 'json' } } }
        ]
      }
    });
    await installFromCatalog({
      organizationId: ORG,
      pluginId: 'coatings',
      executorOrigin: 'http://127.0.0.1:8787'
    });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      executorOrigin: 'http://127.0.0.1:8787'
    }));
    await expect(installFromCatalog({
      organizationId: ORG,
      pluginId: 'coatings',
      endpoints: { poll: 'http://127.0.0.1:8787/poll' }
    })).rejects.toThrow(/no endpoint applies/);
    await expect(installFromCatalog({
      organizationId: ORG,
      pluginId: 'coatings',
      executorOrigin: 'not-a-url'
    })).rejects.toThrow(/absolute http\(s\) URL/);
    expect(repository.createInstall).toHaveBeenCalledTimes(1);
  });

  it('refuses a surface declaration targeting an unsupported mount contract', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 99 }]
      }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toThrow(/Surface coating-designer targets contract version 99/);
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('installs a surface declaration targeting the editor-grade mount contract', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 2 }]
      }
    });
    await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      declarations: expect.objectContaining({
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 2 }]
      })
    }));
  });

  it('refuses a malformed editor binding at the listing contract', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: { ...coatingListing.declarations, editors: [{ type: 'cassette', surface: 'coating-designer', modes: ['edit'] }] }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Invalid plugin listing') });
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('refuses a plugin type shadowing a system type id', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: { types: [{ id: 'organization', class: 'item', fields: {} }] }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('refuses a plugin type an org declaration already holds', async () => {
    const { listByOrganization } = await import('../cts-types/repository.js');
    listByOrganization.mockResolvedValue([
      { id: 'coating', class: 'item', scope: 'org', organizationId: ORG, version: 1, fields: { code: { base: 'string', identifier: true } } }
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
    expect(result).toMatchObject({ removed: true, cascadeRemoved: [] });
    expect(repository.deleteInstall).toHaveBeenCalledWith(ORG, 'coatings');
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('previews dependants and live data for the confirm dialog', async () => {
    repository.findInstall.mockResolvedValue(coatingInstall);
    repository.listInstallsByOrganization.mockResolvedValue([
      coatingInstall,
      { ...coatingInstall, pluginId: 'primers', requires: ['coatings'] }
    ]);
    countInstancesOfType.mockResolvedValue(3);
    const preview = await uninstallPreview({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(preview.dependants).toEqual([{ pluginId: 'primers', name: 'Coatings', version: '2' }]);
    expect(preview.removing.sort()).toEqual(['coatings', 'primers']);
    expect(preview.blocked.every(entry => entry.pluginId === 'coatings' || entry.pluginId === 'primers')).toBe(true);
    countInstancesOfType.mockResolvedValue(0);
  });

  it('refuses uninstall while another installed plugin requires it, naming the dependant', async () => {
    repository.findInstall.mockResolvedValue(coatingInstall);
    repository.listInstallsByOrganization.mockResolvedValue([
      coatingInstall,
      { ...coatingInstall, pluginId: 'primers', requires: ['coatings'] }
    ]);
    await expect(uninstall({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('required by installed plugin primers'),
        data: { dependants: [{ pluginId: 'primers', name: 'Coatings', version: '2' }] }
      });
    expect(repository.deleteInstall).not.toHaveBeenCalled();
  });

  it('cascades the uninstall over dependants when confirmed', async () => {
    repository.findInstall.mockResolvedValue(coatingInstall);
    repository.listInstallsByOrganization.mockResolvedValue([
      coatingInstall,
      { ...coatingInstall, pluginId: 'primers', requires: ['coatings'] }
    ]);
    const result = await uninstall({ organizationId: ORG, pluginId: 'coatings', cascade: true, auth: AUTH });
    expect(result).toEqual({ removed: true, cascadeRemoved: ['primers'] });
    expect(repository.deleteInstall).toHaveBeenCalledWith(ORG, 'coatings');
    expect(repository.deleteInstall).toHaveBeenCalledWith(ORG, 'primers');
  });

  it('refuses a cascade while any removing type holds live data, deleting nothing', async () => {
    repository.findInstall.mockResolvedValue(coatingInstall);
    repository.listInstallsByOrganization.mockResolvedValue([
      coatingInstall,
      { ...coatingInstall, pluginId: 'primers', requires: ['coatings'] }
    ]);
    countInstancesOfType.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    await expect(uninstall({ organizationId: ORG, pluginId: 'coatings', cascade: true, auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('live data') });
    expect(repository.deleteInstall).not.toHaveBeenCalled();
    countInstancesOfType.mockResolvedValue(0);
  });

  it('refuses to retract a built-in listing', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({ pluginId: 'facade', builtin: true });
    await expect(retractListing('facade'))
      .rejects.toMatchObject({ message: expect.stringContaining('deployment-published') });
    expect(repository.deleteCatalogListing).not.toHaveBeenCalled();
  });

  it('serves private catalog listings only to their owning organizations', async () => {
    repository.listCatalog.mockResolvedValue([
      { pluginId: 'public-one', name: 'Public', version: '1', declarations: {} },
      { pluginId: 'private-one', name: 'Private', version: '1', visibility: 'private', organizations: [ORG], declarations: {} },
      { pluginId: 'private-other', name: 'Private', version: '1', visibility: 'private', organizations: ['org-2'], declarations: {} }
    ]);
    const listings = await listCatalog({ auth: AUTH });
    expect(listings.map(listing => listing.pluginId)).toEqual(['public-one', 'private-one']);
  });

  it('accepts a requirement satisfied by an installed plugin', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      pluginId: 'primers',
      name: 'Primers',
      version: '1',
      requires: ['coatings'],
      declarations: {
        types: [{ id: 'primer', class: 'item', name: 'Primer', fields: { code: { base: 'string', identifier: true } } }]
      }
    });
    repository.listInstallsByOrganization.mockResolvedValue([coatingInstall]);
    await install({ organizationId: ORG, pluginId: 'primers', auth: AUTH });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'primers',
      requires: ['coatings']
    }));
  });

  it('refuses a dependency the license policy forbids (GPL family)', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        dependencies: [
          { name: 'three', version: '0.170.0', module: '/assets/vendor/three.mjs', license: 'MIT' },
          { name: 'libredwg', version: '0.7', module: '/assets/vendor/libredwg.mjs', license: 'GPL-3.0-or-later' }
        ]
      }
    });
    await expect(install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('libredwg@0.7 is GPL-3.0-or-later') });
    expect(repository.createInstall).not.toHaveBeenCalled();
    // The policy is operator-configurable: PLUGIN_FORBIDDEN_LICENSES=none admits it.
    process.env.PLUGIN_FORBIDDEN_LICENSES = 'none';
    try {
      await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
      expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
        declarations: expect.objectContaining({
          dependencies: expect.arrayContaining([expect.objectContaining({ name: 'libredwg' })])
        })
      }));
    } finally {
      delete process.env.PLUGIN_FORBIDDEN_LICENSES;
    }
  });

  it('snapshots declared starter constructs with the install', async () => {    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        types: [
          {
            id: 'coating-sheet',
            class: 'file',
            name: 'Coating sheet',
            payload: { mime: ['text/csv'], accept: ['.csv'], maxSize: 1024, preview: 'table', creation: ['editor'] },
            fields: { name: { base: 'string', identifier: true } }
          }
        ],
        starterConstructs: [{ typeId: 'coating-sheet', construction: 'editor' }]
      }
    });
    await install({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      declarations: expect.objectContaining({
        starterConstructs: [{ typeId: 'coating-sheet', construction: 'editor' }]
      })
    }));
  });

  it('refuses a requirement no install satisfies', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      pluginId: 'primers',
      name: 'Primers',
      version: '1',
      requires: ['no-such-thing'],
      declarations: {
        types: [{ id: 'primer', class: 'item', name: 'Primer', fields: { code: { base: 'string', identifier: true } } }]
      }
    });
    await expect(install({ organizationId: ORG, pluginId: 'primers', auth: AUTH }))
      .rejects.toMatchObject({ message: expect.stringContaining('plugin no-such-thing, which is not installed') });
    expect(repository.createInstall).not.toHaveBeenCalled();
  });

  it('pre-wires a surface origin at install for surface-bearing plugins', async () => {
    repository.findCatalogByPluginId.mockResolvedValue({
      ...coatingListing,
      declarations: {
        ...coatingListing.declarations,
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }]
      }
    });
    await installFromCatalog({ organizationId: ORG, pluginId: 'coatings', surfaceOrigin: 'http://executor:8791' });
    expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
      surfaceOrigin: 'http://executor:8791'
    }));
  });

  it('refuses a surface origin for a plugin that declares no surfaces', async () => {
    repository.findCatalogByPluginId.mockResolvedValue(coatingListing);
    await expect(installFromCatalog({ organizationId: ORG, pluginId: 'coatings', surfaceOrigin: 'http://executor:8791' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('no surface modules') });
    expect(repository.createInstall).not.toHaveBeenCalled();
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

  it('retracts a listing only when no organization holds an install', async () => {
    repository.findCatalogByPluginId.mockResolvedValueOnce(coatingListing);
    repository.countInstallsByPluginId.mockResolvedValueOnce(2);
    await expect(retractListing('coatings')).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.deleteCatalogListing).not.toHaveBeenCalled();

    repository.findCatalogByPluginId.mockResolvedValueOnce(coatingListing);
    repository.countInstallsByPluginId.mockResolvedValueOnce(0);
    await expect(retractListing('coatings')).resolves.toMatchObject({ pluginId: 'coatings', retracted: true });
    expect(repository.deleteCatalogListing).toHaveBeenCalledWith('coatings');
    expect(repository.deletePluginAssets).toHaveBeenCalledWith('coatings');

    await expect(retractListing('missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('publishes a package asset keyed by plugin and version', async () => {
    repository.findCatalogByPluginId.mockResolvedValueOnce(coatingListing);
    await publishPluginAsset({
      pluginId: 'coatings',
      version: '2',
      path: 'engine/index.mjs',
      body: Buffer.from('export {}'),
      contentType: 'text/javascript'
    });
    expect(repository.storePluginAsset).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'coatings',
      version: '2',
      path: 'engine/index.mjs',
      contentType: 'text/javascript'
    }));

    await expect(publishPluginAsset({ pluginId: 'ghost', version: '2', path: 'engine/index.mjs', body: Buffer.from('x') }))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(publishPluginAsset({ pluginId: 'coatings', version: '', path: 'engine/index.mjs', body: Buffer.from('x') }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(publishPluginAsset({ pluginId: 'coatings', version: '2', path: '../etc/passwd', body: Buffer.from('x') }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(publishPluginAsset({ pluginId: 'coatings', version: '2', path: 'engine/index.mjs', body: Buffer.alloc(0) }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repository.storePluginAsset).toHaveBeenCalledTimes(1);
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

  it('composes wireable (record-input) services as plugin-qualified species records — json-input executors stay off the palette', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([{
      ...coatingInstall,
      services: [
        ...coatingListing.declarations.services,
        {
          id: 'mix',
          label: 'Color mix',
          signature: {
            input: { base: 'record', fields: { base: { base: 'string' }, tint: { base: 'string', nullable: true } } },
            output: { base: 'json' }
          }
        },
        {
          id: 'blend',
          label: 'Color blend',
          palette: { group: 'mixing', label: 'Mixing' },
          signature: {
            input: { base: 'record', fields: { base: { base: 'string' } } },
            output: { base: 'json' }
          }
        }
      ]
    }]);
    const services = await servicesForOrganization(ORG);
    expect(services).toHaveLength(2);
    expect(services[0]).toMatchObject({
      id: 'plugin.coatings.mix',
      species: 'service',
      command: 'plugin.coatings.mix',
      group: 'coatings',
      groupLabel: 'Coatings'
    });
    expect(services[1]).toMatchObject({
      id: 'plugin.coatings.blend',
      group: 'mixing',
      groupLabel: 'Mixing'
    });
    const merged = await projectedServicesForOrganization(ORG);
    expect(merged.some(service => service.id === 'plugin.coatings.mix')).toBe(true);
    expect(merged.some(service => service.id === 'plugin.coatings.match')).toBe(false);
  });

  it('gives ungrouped plugin services a stable provider-owned palette group', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([{
      ...coatingInstall,
      name: 'Coatings',
      services: [{
        id: 'render',
        label: 'Render',
        signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } }
      }]
    }]);
    const services = await servicesForOrganization(ORG);
    expect(services[0]).toMatchObject({
      id: 'plugin.coatings.render',
      group: 'coatings',
      groupLabel: 'Coatings'
    });
  });

  it('ignores retired service-level group metadata in legacy install snapshots', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([{
      ...coatingInstall,
      name: 'Coatings',
      services: [{
        id: 'legacy-render',
        label: 'Legacy render',
        group: 'retired-group',
        signature: { input: { base: 'record', fields: {} }, output: { base: 'json' } }
      }]
    }]);
    const [service] = await servicesForOrganization(ORG);
    expect(service).toMatchObject({
      id: 'plugin.coatings.legacy-render',
      group: 'coatings',
      groupLabel: 'Coatings'
    });
  });

  it('projects scalar signature fields as the plugin command parameters', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([{
      ...coatingInstall,
      services: [
        {
          id: 'mix',
          label: 'Color mix',
          signature: {
            input: {
              base: 'record',
              fields: {
                parts: { base: 'list', itemType: { base: 'quantity', unit: 'ml' } },
                coats: { base: 'quantity', unit: 'count', default: 2 },
                tint: { base: 'string', nullable: true }
              }
            },
            output: { base: 'json' }
          }
        }
      ]
    }]);
    const domain = await projectedDomainsForOrganization(ORG);
    expect(domain.commands['plugin.coatings.mix'].input.parameters).toEqual([
      { name: 'coats', label: 'coats', type: 'number', unit: 'count', required: true, default: 2 },
      { name: 'tint', label: 'tint', type: 'string', required: false }
    ]);
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
  // The upgrade's requirement rides the installed-plugin layer (the
  // listingV3 requires 'primers').
  const primersInstall = { ...coatingInstall, pluginId: 'primers' };
  const listingV3 = {
    ...coatingListing,
    version: '3',
    requires: ['primers'],
    declarations: {
      types: [
        // changed: gains a required field WITH a covering default step
        {
          id: 'coating',
          class: 'item',
          name: 'Coating',
          fields: {
            code: { base: 'string', identifier: true },
            gloss: { base: 'string' }
          },
          migrate: [{ kind: 'add-default-field', field: 'gloss', value: 'matte' }]
        },
        // added
        { id: 'primer', class: 'item', name: 'Primer', fields: { code: { base: 'string', identifier: true } } },
        // added file type with an editor binding
        { id: 'coating-sheet', class: 'file', fields: { code: { base: 'string', identifier: true } } }
      ],
      services: [
        ...coatingListing.declarations.services,
        { id: 'polish', label: 'Polish', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } }
      ],
      editors: [{ type: 'coating-sheet', surface: 'coating-designer', modes: ['edit'] }],
      surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }]
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

  it('covers a renamed type with live instances instead of blocking', async () => {
    const renamedListing = {
      ...listingV3,
      declarations: {
        ...listingV3.declarations,
        types: listingV3.declarations.types.map(type => (
          type.id === 'coating' ? { ...type, id: 'enamel', name: 'Enamel', renameFrom: 'coating' } : type
        ))
      }
    };
    repository.findCatalogByPluginId.mockImplementation(async () => renamedListing);
    repository.listInstallsByOrganization.mockResolvedValue([installedV2, primersInstall]);
    countInstancesOfType.mockImplementation(async typeId => (typeId === 'coating' ? 5 : 0));
    const plan = await upgradePreview({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(plan.renamed).toEqual([{ from: 'coating', to: 'enamel', instances: 5 }]);
    expect(plan.added.map(type => type.id)).toEqual(['primer', 'coating-sheet']);
    expect(plan.blocked).toEqual([]);
    expect(plan.changed.map(change => change.typeId)).toEqual(['enamel']);
    const result = await applyUpgrade({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result).toMatchObject({ pluginId: 'coatings', version: '3' });
    const persisted = repository.updateInstallSnapshot.mock.calls[0][2];
    expect(persisted.declarations.types.map(type => type.id)).toContain('enamel');
    expect(persisted.declarations.types.every(type => type.renameFrom === undefined)).toBe(true);
    expect(__db.updates).toContainEqual(expect.objectContaining({
      kind: 'many',
      filter: expect.objectContaining({ type: 'coating' }),
      update: { $set: expect.objectContaining({ type: 'enamel' }) }
    }));
    expect(__db.updates).toContainEqual(expect.objectContaining({
      kind: 'one',
      update: { $set: expect.objectContaining({ relations: { template: { type: 'enamel', id: 'c-1' }, other: [{ type: 'primer', id: 'p-1' }] } }) }
    }));
    countInstancesOfType.mockResolvedValue(0);
  });

  it('applies a clean upgrade as the new pinned snapshot and runs covered steps', async () => {
    countInstancesOfType.mockResolvedValue(7);
    const installedWithEndpoints = { ...installedV2, executorOrigin: 'https://executor.example' };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? installedWithEndpoints : null
    ));
    repository.listInstallsByOrganization.mockResolvedValue([installedWithEndpoints, primersInstall]);
    const result = await applyUpgrade({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(result).toMatchObject({ pluginId: 'coatings', version: '3' });
    const persisted = repository.updateInstallSnapshot.mock.calls[0][2];
    expect(persisted.version).toBe('3');
    expect(persisted.declarations.types.map(type => type.id).sort()).toEqual(['coating', 'coating-sheet', 'primer']);
    // the extended declaration layer rides the pin beside the types
    expect(persisted.declarations.editors).toEqual([{ type: 'coating-sheet', surface: 'coating-designer', modes: ['edit'] }]);
    expect(persisted.requires).toEqual(['primers']);
    // a newly declared endpoint service inherits the install's origin
    expect(persisted.executorOrigin).toBe('https://executor.example');
    expect(persisted).not.toHaveProperty('endpoints');
    // one-time steps never persist (SPEC §11)
    expect(persisted.declarations.types.some(type => type.migrate)).toBe(false);
    expect(applyTypeMigrationSteps).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG,
      steps: [{ kind: 'add-default-field', field: 'gloss', value: 'matte' }]
    }));
    expect(invalidateInstanceDeclarations).toHaveBeenCalledWith(ORG);
  });

  it('preserves the client engine declaration in an upgraded install snapshot', async () => {
    const engineListing = {
      ...listingV3,
      declarations: { ...listingV3.declarations, engine: { module: '/engine/index.mjs' } }
    };
    repository.findCatalogByPluginId.mockResolvedValue(engineListing);
    repository.listInstallsByOrganization.mockResolvedValue([installedV2, primersInstall]);
    await applyUpgrade({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(repository.updateInstallSnapshot.mock.calls[0][2].declarations.engine)
      .toEqual({ module: '/engine/index.mjs' });
  });

  it('refuses an upgrade whose pack requirements no longer hold', async () => {
    repository.findCatalogByPluginId.mockImplementation(async () => ({ ...listingV3, requires: ['primers'] }));
    repository.listInstallsByOrganization.mockResolvedValue([]);
    await expect(applyUpgrade({ organizationId: ORG, pluginId: 'coatings', auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('primers') });
    expect(repository.updateInstallSnapshot).not.toHaveBeenCalled();
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

describe('managed value-service preview', () => {
  const managedInstall = {
    organizationId: ORG,
    pluginId: 'documents',
    version: '31',
    services: [{
      id: 'parse-markdown',
      label: 'Parse markdown',
      nodeVersion: '1',
      palette: { group: 'document-composition' },
      signature: {
        input: { base: 'record', fields: { text: { base: 'string' } } },
        output: { base: 'json', kind: 'text.flow-document' }
      },
      execution: { runtime: 'documents-shared', kind: 'pure', targets: ['browser', 'server'], capabilities: [] }
    }],
    declarations: {
      runtimes: [{ id: 'documents-shared', language: 'javascript', targets: ['browser', 'server'], entry: '/runtime/shared.mjs' }]
    }
  };

  it('executes a managed pure service through its installed package runtime during preview', async () => {
    repository.findInstall.mockResolvedValue(managedInstall);
    const result = await invokePreviewValueService(
      'plugin.documents.parse-markdown',
      { text: '# Hello' },
      AUTH,
      { executionId: 'preview-1', nodeId: 'parse-1' }
    );

    expect(result).toEqual('managed-result');
    expect(enqueueTask).toHaveBeenCalledWith('plugin.documents.parse-markdown', expect.objectContaining({
      parameters: { value: expect.objectContaining({
        pluginId: 'documents', version: '31', runtimeId: 'documents-shared',
        operationId: 'parse-markdown',
        input: { mode: 'preview', config: {}, inputs: { text: '# Hello' }, nodeId: 'parse-1', executionId: 'preview-1', invocationPath: [] }
      }) }
    }), expect.objectContaining({ organizationId: ORG }), expect.objectContaining({ workerType: 'plugin-runtime' }));
  });

  it('refuses effectful managed services in preview', async () => {
    repository.findInstall.mockResolvedValue({
      ...managedInstall,
      services: [{ ...managedInstall.services[0], execution: { ...managedInstall.services[0].execution, kind: 'effect' } }]
    });
    await expect(invokePreviewValueService('plugin.documents.parse-markdown', { text: 'x' }, AUTH))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('cannot execute effect') });
    expect(enqueueTask).not.toHaveBeenCalled();
  });
});

describe('construction value dispatch', () => {
  const constructionInstall = {
    organizationId: ORG,
    pluginId: 'documents',
    version: '34',
    services: [{
      id: 'fill',
      label: 'Fill template',
      nodeVersion: '1',
      signature: { input: { base: 'json' }, output: { base: 'json' } },
      execution: { runtime: 'documents-server', kind: 'pure', targets: ['server'], capabilities: [] }
    }],
    declarations: {
      runtimes: [{ id: 'documents-server', language: 'javascript', targets: ['server'], entry: '/runtime/server.mjs' }]
    }
  };

  it('waits for a managed construction service and unwraps its value', async () => {
    repository.findInstall.mockResolvedValue(constructionInstall);
    const output = await invokeConstructionValueService(
      'plugin.documents.fill',
      { mode: 'fill', refs: {}, draft: { data: {} } },
      AUTH
    );
    expect(output).toBe('managed-result');
    expect(enqueueTask).toHaveBeenCalledWith('plugin.documents.fill', expect.objectContaining({
      parameters: { value: expect.objectContaining({
        pluginId: 'documents', version: '34', runtimeId: 'documents-server', operationId: 'fill',
        input: expect.objectContaining({ inputs: { mode: 'fill', refs: {}, draft: { data: {} } } })
      }) }
    }), expect.objectContaining({ organizationId: ORG }), expect.objectContaining({ workerType: 'plugin-runtime' }));
  });

  it('refuses a claim-mode construction service', async () => {
    repository.findInstall.mockResolvedValue({
      ...constructionInstall,
      services: [{ id: 'fill', label: 'Fill template', signature: { input: { base: 'json' }, output: { base: 'json' } } }]
    });
    await expect(invokeConstructionValueService('plugin.documents.fill', {}, AUTH))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('claim mode') });
    expect(enqueueTask).not.toHaveBeenCalled();
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

  it('pre-wires built-in plugin executors without asking an organization for an endpoint', async () => {
    vi.stubEnv('FACADE_EXECUTOR_URL', 'http://facade-executor:8790');
    try {
      repository.findCatalogByPluginId.mockResolvedValue({
        ...coatingListing,
        pluginId: 'facade',
        name: 'Facade',
        builtin: true,
        declarations: {
          ...coatingListing.declarations,
          services: [{ id: 'render', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } }]
        }
      });
      await installFromCatalog({ organizationId: ORG, pluginId: 'facade' });
      expect(repository.createInstall).toHaveBeenCalledWith(expect.objectContaining({
        pluginId: 'facade', platformManaged: true, executorOrigin: 'http://facade-executor:8790'
      }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not expose platform-managed executor credentials as organization settings', async () => {
    repository.findInstall.mockResolvedValue({
      ...endpointInstall, platformManaged: true,
      executorOrigin: 'http://facade-executor:8790', authToken: 'platform-secret',
      surfaceOrigin: 'https://platform-surfaces.example',
      declarations: { ...endpointInstall.declarations, surfaces: [{ id: 'preview' }] }
    });
    const settings = await settingsFor({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(settings).toMatchObject({
      platformManaged: true,
      executorOrigin: 'http://facade-executor:8790',
      authToken: null,
      surfaceOrigin: null,
      surfaces: false
    });
    await expect(updateSettings({
      organizationId: ORG, pluginId: 'coatings', executorOrigin: null, auth: AUTH
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('managed by the platform') });
    await expect(updateSettings({
      organizationId: ORG, pluginId: 'coatings', surfaceOrigin: 'https://user-controlled.example', auth: AUTH
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('managed by the platform') });
    expect(repository.updateSettings).not.toHaveBeenCalled();
  });

  it('resolves a built-in executor origin for legacy installs missing the persisted value', async () => {
    vi.stubEnv('FACADE_EXECUTOR_URL', 'http://facade-executor:8790');
    const facadeInstall = {
      ...endpointInstall,
      pluginId: 'facade',
      executorOrigin: null,
      services: [{ id: 'render', label: 'Render', mode: 'endpoint', signature: { input: { base: 'record' }, output: { base: 'json' } } }]
    };
    repository.findInstall.mockResolvedValue(facadeInstall);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ shade: 'matte' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await invokeEndpointValueService('plugin.facade.render', { code: 'C-1' }, AUTH);
      expect(result).toEqual({ shade: 'matte' });
      expect(fetchMock).toHaveBeenCalledWith('http://facade-executor:8790', expect.objectContaining({
        body: JSON.stringify({ operationId: 'render', input: { code: 'C-1' } })
      }));
      const settings = await settingsFor({ organizationId: ORG, pluginId: 'facade', auth: AUTH });
      expect(settings.executorOrigin).toBe('http://facade-executor:8790');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
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
      expect(fetchMock).toHaveBeenCalledWith('https://executor.example', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer publisher-key' }),
        body: JSON.stringify({ operationId: 'match', input: { code: 'C-1' } })
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('routes every operation through one provider-level executor origin', async () => {
    const providerInstall = {
      ...endpointInstall,
      executorOrigin: 'https://executor.example/api',
      endpoints: undefined,
      services: [
        { id: 'match', label: 'Match', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } },
        { id: 'poll', label: 'Poll', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } }
      ]
    };
    repository.findInstall.mockResolvedValue(providerInstall);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await executeConnectorService({ id: 'plugin.coatings.match' }, { parameters: {}, auth: AUTH });
      await executeConnectorService({ id: 'plugin.coatings.poll' }, { parameters: {}, auth: AUTH });
      expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
        'https://executor.example/api',
        'https://executor.example/api'
      ]);
      expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body).operationId)).toEqual(['match', 'poll']);
      const settings = await settingsFor({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
      expect(settings.executorOrigin).toBe('https://executor.example/api');
      expect(settings.services.every(service => !Object.hasOwn(service, 'endpoint'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('collapses a legacy operation URL map only when it has one shared provider base', async () => {
    const saved = await updateSettings({
      organizationId: ORG,
      pluginId: 'coatings',
      endpoints: { match: 'https://cloud.example/api/match' },
      auth: AUTH
    });
    expect(repository.updateSettings).toHaveBeenCalledWith(ORG, 'coatings', {
      executorOrigin: 'https://cloud.example/api',
      authToken: null,
      surfaceOrigin: null
    });
    expect(saved.executorOrigin).toBe('https://executor.example');
  });

  it('does not discard divergent legacy URLs until an administrator sets a provider origin', async () => {
    const divergent = {
      ...endpointInstall,
      services: [
        { id: 'match', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } },
        { id: 'poll', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } }
      ],
      endpoints: {
        match: 'https://one.example/match',
        poll: 'https://two.example/poll'
      }
    };
    repository.findInstall.mockResolvedValue(divergent);
    const settings = await settingsFor({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(settings.legacyEndpointConflict).toBe(true);
    expect(settings.executorOrigin).toBe('');
    await expect(updateSettings({
      organizationId: ORG,
      pluginId: 'coatings',
      executorOrigin: null,
      auth: AUTH
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('do not share one provider base') });
    expect(repository.updateSettings).not.toHaveBeenCalled();
  });

  it('replays a deterministic endpoint service through the service cache (SPEC §28)', async () => {
    const cachedInstall = {
      ...endpointInstall,
      services: [
        { id: 'match', label: 'Coating match', mode: 'endpoint', cache: 'deterministic', signature: { input: { base: 'json' }, output: { base: 'json' } } }
      ]
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? cachedInstall : null
    ));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ shade: 'satin' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      // First call: executor answers, the result is stored under the
      // canonical key (structurally equal inputs hash equal).
      const first = await executeConnectorService(
        { id: 'plugin.coatings.match', service: 'plugin.coatings' },
        { parameters: { code: 'C-1' }, auth: AUTH }
      );
      expect(first).toEqual({ shade: 'satin' });
      const [storedKey, storedResult] = repository.storeCachedServiceResult.mock.calls[0];
      expect(storedKey).toMatch(/^coatings@2:match:[0-9a-f]{64}$/);
      expect(storedResult).toEqual({ shade: 'satin' });

      // Second call with reordered keys: same canonical key, cache hit,
      // no executor call.
      repository.findCachedServiceResult.mockResolvedValueOnce({ _id: storedKey, result: { shade: 'satin' } });
      const second = await executeConnectorService(
        { id: 'plugin.coatings.match', service: 'plugin.coatings' },
        { parameters: { code: 'C-1' } , auth: AUTH }
      );
      expect(second).toEqual({ shade: 'satin' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      repository.findCachedServiceResult.mockResolvedValue(null);
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

  it('dispatches a preview value service through the endpoint with the same cache replay', async () => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings'
        ? {
          ...endpointInstall,
          services: [
            { id: 'match', label: 'Coating match', mode: 'endpoint', cache: 'deterministic', signature: { input: { base: 'json' }, output: { base: 'json' } } }
          ]
        }
        : null
    ));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ shade: 'matte' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const first = await invokeEndpointValueService('plugin.coatings.match', { code: 'C-1' }, AUTH);
      expect(first).toEqual({ shade: 'matte' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      repository.findCachedServiceResult.mockResolvedValueOnce({ result: { shade: 'matte' } });
      const second = await invokeEndpointValueService('plugin.coatings.match', { code: 'C-1' }, AUTH);
      expect(second).toEqual({ shade: 'matte' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      repository.findCachedServiceResult.mockResolvedValue(null);
      vi.unstubAllGlobals();
    }
  });

  it('refuses a preview dispatch of a claim-mode service', async () => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings'
        ? { ...endpointInstall, services: [{ id: 'poll', label: 'Poll', signature: { input: { base: 'json' }, output: { base: 'json' } } }] }
        : null
    ));
    await expect(invokeEndpointValueService('plugin.coatings.poll', {}, AUTH))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('claim mode') });
  });

  it('refuses every server dispatch of a client-engine service', async () => {
    const localInstall = {
      ...coatingInstall,
      services: [{ id: 'spin', label: 'Spin', mode: 'local', signature: { input: { base: 'json' }, output: { base: 'json' } } }],
      declarations: { ...coatingInstall.declarations, engine: { module: '/engine/index.mjs' } }
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? localInstall : null
    ));
    await expect(executeConnectorService({ id: 'plugin.coatings.spin' }, { parameters: {}, auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('client engine') });
    await expect(invokeEndpointValueService('plugin.coatings.spin', {}, AUTH))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('local mode') });
    await expect(updateSettings({ organizationId: ORG, pluginId: 'coatings', endpoints: { spin: 'https://example.org/service' }, auth: AUTH }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('no endpoint applies') });
    const settings = await settingsFor({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(settings.services.every(service => service.mode === 'local')).toBe(true);
  });

  it('404s a preview dispatch of an uninstalled service', async () => {
    await expect(invokeEndpointValueService('plugin.coatings.unknown', {}, AUTH))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('hydrates a declared blob input field with its stored payload bytes', async () => {
    const blobInstall = {
      ...endpointInstall,
      services: [
        {
          id: 'match',
          label: 'Coating match',
          mode: 'endpoint',
          signature: { input: { base: 'record', fields: { payload: { base: 'blob' } } }, output: { base: 'json' } }
        }
      ]
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? blobInstall : null
    ));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ shade: 'matte' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const handle = { fileId: 'f-1', mime: 'text/csv', size: 7, name: 'spec.csv' };
      const result = await invokeEndpointValueService('plugin.coatings.match', { payload: handle }, AUTH);
      expect(result).toEqual({ shade: 'matte' });
      expect(fetchMock).toHaveBeenCalledWith('https://executor.example', expect.objectContaining({
        body: JSON.stringify({ operationId: 'match', input: { payload: { ...handle, payloadBase64: Buffer.from('payload').toString('base64') } } })
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keys the deterministic cache on the raw handle, beside the hydration', async () => {
    const blobInstall = {
      ...endpointInstall,
      services: [
        {
          id: 'match',
          label: 'Coating match',
          mode: 'endpoint',
          cache: 'deterministic',
          signature: { input: { base: 'record', fields: { payload: { base: 'blob' } } }, output: { base: 'json' } }
        }
      ]
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? blobInstall : null
    ));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const handle = { fileId: 'f-1', mime: 'text/csv', size: 7 };
      const first = await invokeEndpointValueService('plugin.coatings.match', { payload: { ...handle } }, AUTH);
      expect(first).toEqual({ ok: true });

      // Same handle: cache hit under the raw-parameter key, one fetch.
      const [storedKey, storedResult] = repository.storeCachedServiceResult.mock.calls[0];
      repository.findCachedServiceResult.mockResolvedValueOnce({ result: storedResult });
      const second = await invokeEndpointValueService('plugin.coatings.match', { payload: { ...handle } }, AUTH);
      expect(second).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(storedKey).toMatch(/^coatings@2:match:[0-9a-f]{64}$/);
    } finally {
      repository.findCachedServiceResult.mockResolvedValue(null);
      vi.unstubAllGlobals();
    }
  });

  it('saves and serves the surface origin beside the endpoints', async () => {
    repository.findInstall.mockResolvedValue({
      ...endpointInstall,
      surfaceOrigin: 'http://surface-executor:8791',
      declarations: {
        ...coatingListing.declarations,
        surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }]
      }
    });
    const saved = await updateSettings({
      organizationId: ORG,
      pluginId: 'coatings',
      endpoints: { match: 'https://executor.example/match' },
      surfaceOrigin: 'http://surface-executor:8791',
      auth: AUTH
    });
    expect(repository.updateSettings).toHaveBeenCalledWith(ORG, 'coatings', expect.objectContaining({
      surfaceOrigin: 'http://surface-executor:8791'
    }));
    expect(saved.surfaces).toBe(true);
    expect(saved.surfaceOrigin).toBe('http://surface-executor:8791');
  });

  it('saves and serves connection settings, refusing endpoints for claim services', async () => {
    const settings = await settingsFor({ organizationId: ORG, pluginId: 'coatings', auth: AUTH });
    expect(settings.services).toEqual([
      { id: 'match', label: 'Coating match', mode: 'endpoint' }
    ]);
    expect(settings.executorOrigin).toBe('https://executor.example');
    expect(settings.authToken).toBe('publisher-key');

    const saved = await updateSettings({
      organizationId: ORG,
      pluginId: 'coatings',
      executorOrigin: 'https://cloud.example',
      authToken: 'new-key',
      auth: AUTH
    });
    expect(repository.updateSettings).toHaveBeenCalledWith(ORG, 'coatings', {
      executorOrigin: 'https://cloud.example',
      authToken: 'new-key',
      surfaceOrigin: null
    });
    expect(saved.executorOrigin).toBe('https://executor.example');

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
      executorOrigin: 'https://cloud.example',
      auth: AUTH
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('starter constructs and service-resolved projections', () => {
  it('composes the installed plugins\' starter constructs, one per type', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([{
      ...coatingInstall,
      declarations: {
        ...coatingInstall.declarations,
        starterConstructs: [{ typeId: 'coating', construction: 'editor' }]
      }
    }]);
    const constructs = await starterConstructsForOrganization(ORG);
    expect(constructs).toEqual([
      { typeId: 'coating', construction: 'editor' }
    ]);
  });

  it('refuses a starter construct collision between two installs', async () => {
    repository.listInstallsByOrganization.mockResolvedValue([
      { ...coatingInstall, declarations: { ...coatingInstall.declarations, starterConstructs: [{ typeId: 'coating', construction: 'editor' }] } },
      { ...coatingInstall, pluginId: 'primers', declarations: { ...coatingInstall.declarations, starterConstructs: [{ typeId: 'coating', construction: 'upload' }] } }
    ]);
    await expect(starterConstructsForOrganization(ORG))
      .rejects.toMatchObject({ statusCode: 500, message: expect.stringContaining('coating') });
  });

  const projectionInstall = {
    organizationId: ORG,
    pluginId: 'coatings',
    name: 'Coatings',
    version: '2',
    declarations: coatingListing.declarations,
    services: [
      { id: 'table-rows', label: 'Table rows', mode: 'endpoint', signature: { input: { base: 'json' }, output: { base: 'json' } } }
    ],
    endpoints: { 'table-rows': 'https://executor.example/table-rows' }
  };

  const projectionRuntimeSource = 'export function createRuntime() { return { execute: (operationId, input) => ({ operationId, input }) }; }';
  const managedProjectionInstall = {
    organizationId: ORG,
    pluginId: 'coatings',
    name: 'Coatings',
    version: '3',
    declarations: {
      ...coatingListing.declarations,
      runtimes: [{ id: 'coatings-shared', language: 'javascript', version: '1', entry: '/runtime/shared-bundle.mjs', targets: ['server'] }]
    },
    services: [
      { id: 'table-rows', label: 'Table rows', execution: { runtime: 'coatings-shared', kind: 'pure', targets: ['server'] }, signature: { input: { base: 'json' }, output: { base: 'json' } } }
    ],
    packageAssets: { count: 1, assets: [{ path: 'runtime/shared-bundle.mjs', contentHash: 'sha256:abc' }] }
  };

  it('executes a managed pure projection through the synchronous boundary with the instance envelope', async () => {
    repository.findInstall.mockResolvedValue(managedProjectionInstall);
    repository.findOrganizationPluginAssetMeta.mockResolvedValue({ id: 'asset-1', contentType: 'text/javascript' });
    repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.from(projectionRuntimeSource));
    instanceServiceResolver.mockReturnValue({
      getById: vi.fn(async () => ({ _id: 'inst-1', fields: { name: 'Sheet 1' }, payload: { fileId: 'file-1' } }))
    });
    try {
      const value = await resolveProjectionValue({
        organizationId: ORG,
        commandId: 'plugin.coatings.table-rows',
        typeId: 'csv-table',
        instanceId: 'inst-1'
      });
      expect(value).toEqual({
        operationId: 'table-rows',
        input: {
          typeId: 'csv-table',
          instanceId: 'inst-1',
          fields: { name: 'Sheet 1' },
          payloadBase64: Buffer.from('payload').toString('base64')
        }
      });
      expect(repository.findOrganizationPluginAssetMeta).toHaveBeenCalledWith(ORG, 'coatings', '3', 'runtime/shared-bundle.mjs');
    } finally {
      repository.findOrganizationPluginAssetMeta.mockResolvedValue(null);
      repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.alloc(0));
    }
  });

  it('executes the real Documents shared bundle through the boundary over a hydrated instance payload', async () => {
    const bundle = await readFile(resolve(__dirname, '../../../workers/documents/runtime/shared-bundle.mjs'));
    const services = documentsListingV34.declarations.services.filter(item => ['text', 'table-rows', 'table-cells'].includes(item.id));
    const install = {
      ...managedProjectionInstall,
      pluginId: 'documents',
      declarations: { ...managedProjectionInstall.declarations, runtimes: documentsListingV34.declarations.runtimes },
      services,
      packageAssets: { count: 1, assets: [{ path: 'runtime/shared-bundle.mjs', contentHash: 'sha256:abc' }] }
    };
    repository.findInstall.mockResolvedValue(install);
    repository.findOrganizationPluginAssetMeta.mockResolvedValue({ id: 'asset-1', contentType: 'text/javascript' });
    repository.readOrganizationPluginAsset.mockResolvedValue(bundle);
    instanceServiceResolver.mockReturnValue({
      getById: vi.fn(async () => ({ _id: 'inst-9', fields: { name: 'Stock' }, payload: { fileId: 'file-9' } }))
    });
    filesService.getFileBuffer
      .mockResolvedValueOnce(Buffer.from('name,qty\naluminium,12\nsteel,3\n', 'utf8'))
      .mockResolvedValueOnce(Buffer.from('name,qty\naluminium,12\nsteel,3\n', 'utf8'));
    try {
      const rows = await resolveProjectionValue({
        organizationId: ORG,
        commandId: 'plugin.documents.table-rows',
        typeId: 'csv-table',
        instanceId: 'inst-9'
      });
      expect(rows).toEqual([
        { name: 'aluminium', qty: 12 },
        { name: 'steel', qty: 3 }
      ]);
      const text = await resolveProjectionValue({
        organizationId: ORG,
        commandId: 'plugin.documents.text',
        typeId: 'text-document',
        instanceId: 'inst-9'
      });
      expect(text).toBe('name,qty\naluminium,12\nsteel,3\n');
    } finally {
      repository.findOrganizationPluginAssetMeta.mockResolvedValue(null);
      repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.alloc(0));
    }
  });

  it('refuses a managed projection whose installed entry fails its digest check', async () => {
    repository.findInstall.mockResolvedValue({
      ...managedProjectionInstall,
      packageAssets: { count: 1, assets: [{ path: 'runtime/shared-bundle.mjs', contentHash: 'sha256:different' }] }
    });
    repository.findOrganizationPluginAssetMeta.mockResolvedValue({ id: 'asset-1' });
    repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.from(projectionRuntimeSource));
    try {
      await expect(resolveProjectionValue({
        organizationId: ORG,
        commandId: 'plugin.coatings.table-rows',
        typeId: 'csv-table',
        instanceId: 'inst-1'
      })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('content digest') });
    } finally {
      repository.findOrganizationPluginAssetMeta.mockResolvedValue(null);
      repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.alloc(0));
    }
  });

  it('refuses a managed projection that is not a pure server operation', async () => {
    repository.findInstall.mockResolvedValue({
      ...managedProjectionInstall,
      services: [
        { id: 'table-rows', label: 'Table rows', execution: { runtime: 'coatings-shared', kind: 'read', targets: ['server'], capabilities: ['files.read'] }, signature: { input: { base: 'json' }, output: { base: 'json' } } }
      ]
    });
    instanceServiceResolver.mockReturnValue({
      getById: vi.fn(async () => ({ _id: 'inst-1', fields: { name: 'Sheet 1' } }))
    });
    await expect(resolveProjectionValue({
      organizationId: ORG,
      commandId: 'plugin.coatings.table-rows',
      typeId: 'csv-table',
      instanceId: 'inst-1'
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('managed pure server operation') });
  });

  it('dispatches an endpoint-resolved projection with the instance fields and payload', async () => {
    repository.findInstall.mockResolvedValue(projectionInstall);
    instanceServiceResolver.mockReturnValue({
      getById: vi.fn(async () => ({ _id: 'inst-1', fields: { name: 'Sheet 1' }, payload: { fileId: 'file-1' } }))
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ A: '1' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const value = await resolveProjectionValue({
        organizationId: ORG,
        commandId: 'plugin.coatings.table-rows',
        typeId: 'csv-table',
        instanceId: 'inst-1'
      });
      expect(value).toEqual([{ A: '1' }]);
      expect(fetchMock).toHaveBeenCalledWith('https://executor.example', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ operationId: 'table-rows', input: {
          typeId: 'csv-table',
          instanceId: 'inst-1',
          fields: { name: 'Sheet 1' },
          payloadBase64: Buffer.from('payload').toString('base64')
        } })
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('dispatches a projection over a payload-less instance without a payload block', async () => {
    repository.findInstall.mockResolvedValue(projectionInstall);
    instanceServiceResolver.mockReturnValue({
      getById: vi.fn(async () => ({ _id: 'inst-1', fields: { geometry: { layerData: [] } } }))
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const value = await resolveProjectionValue({
        organizationId: ORG,
        commandId: 'plugin.coatings.table-rows',
        typeId: 'csv-table',
        instanceId: 'inst-1'
      });
      expect(value).toEqual([]);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('payloadBase64');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a projection bound to a claim-mode service', async () => {
    repository.findInstall.mockResolvedValue({
      ...projectionInstall,
      services: [{ id: 'table-rows', label: 'Table rows', signature: { input: { base: 'json' }, output: { base: 'json' } } }]
    });
    instanceServiceResolver.mockReturnValue({
      getById: vi.fn(async () => ({ _id: 'inst-1', fields: { name: 'Sheet 1' } }))
    });
    await expect(resolveProjectionValue({
      organizationId: ORG,
      commandId: 'plugin.coatings.table-rows',
      typeId: 'csv-table',
      instanceId: 'inst-1'
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('claim mode') });
  });
});

describe('fetchSurfaceModule (the plugin-module proxy core)', () => {
  const moduleInstall = {
    organizationId: ORG,
    pluginId: 'coatings',
    declarations: coatingListing.declarations,
    endpoints: { match: 'https://executor.example/match' }
  };

  beforeEach(() => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? moduleInstall : null
    ));
  });

  it('streams the module from the install endpoint origin, strictly under it', async () => {
    const fetchMock = vi.fn(async () => new Response('export default null;', {
      status: 200,
      headers: { 'content-type': 'application/javascript' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const module = await fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/surfaces/designer.mjs',
        auth: AUTH
      });
      expect(module.contentType).toBe('application/javascript');
      expect(module.body.toString()).toBe('export default null;');
      expect(fetchMock).toHaveBeenCalledWith('https://executor.example/surfaces/designer.mjs', expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses traversal-shaped paths', async () => {
    for (const modulePath of ['/surfaces/../../etc/passwd', '/%2E%2E/secret', '/a/b\\c']) {
      await expect(fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath,
        auth: AUTH
      })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('serves an engine install\'s modules from its organization-owned package', async () => {
    const engineInstall = {
      ...moduleInstall,
      version: '2',
      endpoints: {},
      packageAssets: { count: 1, assets: [{ path: 'engine/index.mjs', contentHash: 'sha256:abc', bytes: 42 }] },
      declarations: {
        ...moduleInstall.declarations,
        engine: { module: '/engine/index.mjs' },
        dependencies: [
          { name: 'three', version: '0.170.0', module: '/assets/vendor/three.mjs', license: 'MIT' }
        ]
      }
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? engineInstall : null
    ));
    repository.findOrganizationPluginAssetMeta.mockResolvedValue({ id: 'asset-1', contentType: 'text/javascript', contentHash: 'sha256:abc' });
    repository.readOrganizationPluginAsset.mockResolvedValue(Buffer.from("import * as THREE from 'three';\nexport default null;\n"));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const module = await fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/engine/index.mjs',
        auth: AUTH
      });
      expect(repository.findOrganizationPluginAssetMeta).toHaveBeenCalledWith(ORG, 'coatings', '2', 'engine/index.mjs');
      expect(module.contentType).toBe('text/javascript');
      expect(module.body.toString()).toContain(`import * as THREE from '/api/plugins/coatings/module/assets/vendor/three.mjs'`);
      expect(module.etag).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('serves a packaged binary asset untouched under its stored type', async () => {
    const engineInstall = {
      ...moduleInstall,
      version: '2',
      endpoints: {},
      declarations: { ...moduleInstall.declarations, engine: { module: '/engine/index.mjs' } }
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? engineInstall : null
    ));
    const bytes = Buffer.from([0, 1, 2, 3]);
    repository.findPluginAssetMeta.mockResolvedValue({ id: 'asset-2', contentType: 'application/wasm', contentHash: 'sha256:def' });
    repository.readPluginAsset.mockResolvedValue(bytes);
    const module = await fetchSurfaceModule({
      organizationId: ORG,
      pluginId: 'coatings',
      modulePath: '/engine/runtime/core.wasm',
      auth: AUTH
    });
    expect(module.contentType).toBe('application/wasm');
    expect(module.body.equals(bytes)).toBe(true);
  });

  it('404s a packaged path the package does not carry', async () => {
    const engineInstall = {
      ...moduleInstall,
      version: '2',
      endpoints: {},
      declarations: { ...moduleInstall.declarations, engine: { module: '/engine/index.mjs' } }
    };
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? engineInstall : null
    ));
    repository.findPluginAssetMeta.mockResolvedValue(null);
    await expect(fetchSurfaceModule({
      organizationId: ORG,
      pluginId: 'coatings',
      modulePath: '/engine/missing.mjs',
      auth: AUTH
    })).rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('package does not carry') });
  });

  it('rewrites declared bare imports to the plugin\'s proxied vendor scope', async () => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings'
        ? {
          ...moduleInstall,
          declarations: {
            ...moduleInstall.declarations,
            dependencies: [
              { name: 'three', version: '0.170.0', module: '/assets/vendor/three.mjs', license: 'MIT' }
            ]
          }
        }
        : null
    ));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'import * as THREE from \'three\';\nimport local from \'./local.js\';\nconst dyn = () => import(\'three\');\nexport default null;\n',
      { status: 200, headers: { 'content-type': 'application/javascript' } }
    )));
    try {
      const module = await fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/surfaces/designer.mjs',
        auth: AUTH
      });
      const source = module.body.toString();
      expect(source).toContain(`import * as THREE from '/api/plugins/coatings/module/assets/vendor/three.mjs'`);
      expect(source).toContain(`import('three')`.replace("'three'", `'/api/plugins/coatings/module/assets/vendor/three.mjs'`));
      // Relative imports pass through untouched — the proxied path resolves them.
      expect(source).toContain(`import local from './local.js'`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rewrites a cross-plugin dependency to the required plugin\'s scope', async () => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings'
        ? {
          ...moduleInstall,
          declarations: {
            ...moduleInstall.declarations,
            dependencies: [
              { name: 'cad-viewer', version: '1.7.5', module: 'plugin:tech-drawing/assets/vendor/cad-viewer/cad-viewer.mjs', license: 'MIT' }
            ]
          }
        }
        : null
    ));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'const load = () => import(\'cad-viewer\');\nexport default null;\n',
      { status: 200, headers: { 'content-type': 'application/javascript' } }
    )));
    try {
      const module = await fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/surfaces/designer.mjs',
        auth: AUTH
      });
      expect(module.body.toString()).toContain(`'/api/plugins/tech-drawing/module/assets/vendor/cad-viewer/cad-viewer.mjs'`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('streams non-JS vendor assets untouched', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, {
      status: 200, headers: { 'content-type': 'image/png' }
    })));
    try {
      const module = await fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/assets/vendor/texture.png',
        auth: AUTH
      });
      expect(Buffer.compare(module.body, bytes)).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('serves modules through a surface-origin-only install (no service endpoints)', async () => {
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings'
        ? {
          ...moduleInstall,
          endpoints: {},
          surfaceOrigin: 'http://surface-executor:8791',
          declarations: {
            ...moduleInstall.declarations,
            surfaces: [{ id: 'coating-designer', module: '/surfaces/coating-designer.mjs', surfaceContract: 1 }]
          }
        }
        : null
    ));
    const fetchMock = vi.fn(async () => new Response('export default null;', {
      status: 200, headers: { 'content-type': 'application/javascript' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const module = await fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/surfaces/designer.mjs',
        auth: AUTH
      });
      expect(module.body.toString()).toBe('export default null;');
      expect(fetchMock).toHaveBeenCalledWith('http://surface-executor:8791/surfaces/designer.mjs', expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('serves any member of the installing org; the organizations grant is not the gate', async () => {
    vi.mocked(hasPermission).mockImplementation(() => false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('export default null;', {
      status: 200, headers: { 'content-type': 'application/javascript' }
    })));
    try {
      const module = await fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/surfaces/designer.mjs',
        auth: AUTH
      });
      expect(module.body.toString()).toBe('export default null;');
    } finally {
      vi.mocked(hasPermission).mockImplementation(() => true);
      vi.unstubAllGlobals();
    }
  });

  it('404s without an install and 503s without a connected endpoint', async () => {
    await expect(fetchSurfaceModule({
      organizationId: ORG,
      pluginId: 'missing',
      modulePath: '/surfaces/designer.mjs',
      auth: AUTH
    })).rejects.toMatchObject({ statusCode: 404 });
    repository.findInstall.mockImplementation(async (organizationId, pluginId) => (
      String(organizationId) === ORG && pluginId === 'coatings' ? { ...moduleInstall, endpoints: {} } : null
    ));
    await expect(fetchSurfaceModule({
      organizationId: ORG,
      pluginId: 'coatings',
      modulePath: '/surfaces/designer.mjs',
      auth: AUTH
    })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('surfaces executor failures as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    try {
      await expect(fetchSurfaceModule({
        organizationId: ORG,
        pluginId: 'coatings',
        modulePath: '/surfaces/designer.mjs',
        auth: AUTH
      })).rejects.toMatchObject({ statusCode: 502 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
