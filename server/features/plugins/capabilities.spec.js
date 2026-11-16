import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokePluginCapability } from './capabilities.js';

const { findInstall, queryOrganizationData, getInstanceService, assertFileReadAccess, findFileMeta, getFileBuffer } = vi.hoisted(() => ({
  findInstall: vi.fn(), queryOrganizationData: vi.fn(), getInstanceService: vi.fn(),
  assertFileReadAccess: vi.fn(), findFileMeta: vi.fn(), getFileBuffer: vi.fn()
}));
vi.mock('./repository.js', () => ({ findInstall }));
vi.mock('../graph-executions/service.js', () => ({ queryOrganizationData }));
vi.mock('../files/service.js', () => ({ assertFileReadAccess, findFileMeta, getFileBuffer }));
vi.mock('../../runtime/app-registry.js', () => ({ getAppRegistry: () => ({ getInstanceService }) }));

const auth = { userId: 'user-1', organizationId: 'org-1', memberships: [{ organizationId: 'org-1' }] };
const install = {
  pluginId: 'demo', version: '4',
  declarations: { runtimes: [{ id: 'javascript', targets: ['browser', 'server'] }] },
  services: [
    { id: 'read', execution: { runtime: 'javascript', targets: ['browser', 'server'], kind: 'read', capabilities: ['organization.instances.query'] } },
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
  it('refuses durable writes from browser execution', async () => {
    await expect(invokePluginCapability({
      organizationId: 'org-1', pluginId: 'demo', version: '4', runtimeId: 'javascript',
      operationId: 'write', name: 'organization.instances.update', input: {}, target: 'browser', auth
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
