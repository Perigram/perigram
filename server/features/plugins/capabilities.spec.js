import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokePluginCapability } from './capabilities.js';

const { findInstall, queryOrganizationData, getInstanceService, assertFileReadAccess, findFileMeta, getFileBuffer, contentHash } = vi.hoisted(() => ({
  findInstall: vi.fn(), queryOrganizationData: vi.fn(), getInstanceService: vi.fn(),
  assertFileReadAccess: vi.fn(), findFileMeta: vi.fn(), getFileBuffer: vi.fn(), contentHash: vi.fn()
}));
vi.mock('./repository.js', () => ({ findInstall }));
vi.mock('../graph-executions/service.js', () => ({ queryOrganizationData }));
vi.mock('../files/service.js', () => ({ assertFileReadAccess, findFileMeta, getFileBuffer, contentHash }));
vi.mock('../../runtime/app-registry.js', () => ({ getAppRegistry: () => ({ getInstanceService }) }));

const auth = { userId: 'user-1', organizationId: 'org-1', memberships: [{ organizationId: 'org-1' }] };
const install = {
  pluginId: 'demo', version: '4',
  declarations: { runtimes: [{ id: 'javascript', targets: ['browser', 'server'] }] },
  services: [
    { id: 'nesting-solve', execution: { runtime: 'javascript', targets: ['server'], kind: 'read', capabilities: ['nesting.solve'] } },
    { id: 'read', execution: { runtime: 'javascript', targets: ['browser', 'server'], kind: 'read', capabilities: ['organization.instances.query', 'files.read'] } },
    { id: 'write', execution: { runtime: 'javascript', targets: ['server'], kind: 'effect', capabilities: ['organization.instances.update'] } }
  ]
};
beforeEach(() => { vi.clearAllMocks(); findInstall.mockResolvedValue(install); queryOrganizationData.mockResolvedValue({ items: [] }); });

describe('managed plugin host capabilities', () => {
  it('authorizes browser reads through the active principal', async () => {
    await expect(invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '4', runtimeId: 'javascript',
      operationId: 'read', name: 'organization.instances.query', input: { typeId: 'records' },
      target: 'browser', auth
    })).resolves.toEqual({ items: [] });
    expect(queryOrganizationData).toHaveBeenCalledWith({ typeId: 'records' }, auth);
  });
  it('returns the actual file ownership scope with verifiable read evidence', async () => {
    const metadata = { organizationId: null, userId: 'user-1' };
    findFileMeta.mockResolvedValue({
      filename: 'source.md',
      contentType: 'text/markdown',
      length: 6,
      metadata
    });
    getFileBuffer.mockResolvedValue(Buffer.from('source'));
    contentHash.mockReturnValue('sha256:source');

    await expect(invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '4', runtimeId: 'javascript',
      operationId: 'read', name: 'files.read', input: { fileId: 'file-1' },
      target: 'server', auth
    })).resolves.toEqual({
      fileId: 'file-1',
      name: 'source.md',
      mime: 'text/markdown',
      size: 6,
      organizationId: null,
      contentHash: 'sha256:source',
      base64: 'c291cmNl'
    });
    expect(assertFileReadAccess).toHaveBeenCalledWith(metadata, auth);
  });

  it('refuses durable writes from browser execution', async () => {
    await expect(invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '4', runtimeId: 'javascript',
      operationId: 'write', name: 'organization.instances.update', input: {}, target: 'browser', auth
    })).rejects.toMatchObject({ statusCode: 403 });
  });
  it('forwards an expected instance revision to the authoritative update boundary', async () => {
    const patch = vi.fn(async () => ({ _id: 'item-1', revision: 5 }));
    getInstanceService.mockReturnValue({ patch });
    await invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '4', runtimeId: 'javascript',
      operationId: 'write', name: 'organization.instances.update',
      input: { typeId: 'records', instanceId: 'item-1', patch: { fields: { name: 'Updated' } }, expectedRevision: 4 },
      target: 'server', auth
    });
    expect(patch).toHaveBeenCalledWith('item-1', { fields: { name: 'Updated' } }, {
      auth, organizationId: 'org-1', expectedRevision: 4
    });
  });
  it('routes the declared Nesting plugin capability through the platform endpoint', async () => {
    findInstall.mockResolvedValue({
      ...install,
      pluginId: 'nesting'
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', layouts: [] })
    });
    vi.stubEnv('NESTING_WORKER_URL', 'https://nesting.internal/nest');
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(invokePluginCapability({
        organizationId: 'org-1', pluginId: 'facade', version: '4', runtimeId: 'javascript',
        operationId: 'nesting-solve', name: 'nesting.solve',
        input: { items: [{ id: 1 }], params: { width: 100, height: 100 } },
        target: 'server', auth
      })).resolves.toEqual({ status: 'ok', layouts: [] });
      expect(fetchMock).toHaveBeenCalledWith(new URL('https://nesting.internal/nest'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ id: 1 }], params: { width: 100, height: 100 } })
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('does not let another plugin invoke the Nesting-specific adapter', async () => {
    await expect(invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '4', runtimeId: 'javascript',
      operationId: 'nesting-solve', name: 'nesting.solve',
      input: {}, target: 'server', auth
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses capabilities absent from the operation declaration', async () => {
    await expect(invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '4', runtimeId: 'javascript',
      operationId: 'read', name: 'organization.instances.update', input: {}, target: 'server', auth
    })).rejects.toMatchObject({ statusCode: 403 });
  });
  it('refuses stale installed package versions', async () => {
    await expect(invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '3', runtimeId: 'javascript',
      operationId: 'read', name: 'organization.instances.query', target: 'browser', auth
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
