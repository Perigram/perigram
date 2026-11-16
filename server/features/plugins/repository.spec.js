import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  findFileMetaByFilename: vi.fn(),
  getFileBuffer: vi.fn(),
  listFileMetasWhere: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn()
}));
vi.mock('../files/service.js', () => mocks);
vi.mock('../../db/mongo.js', () => ({ connectDB: vi.fn() }));

import { materializePluginAssets, ORG_PLUGIN_ASSETS_BUCKET, PLUGIN_ASSETS_BUCKET } from './repository.js';

describe('organization-owned plugin asset materialization', () => {
  const sourceBytes = Buffer.from('export default 42;');
  const digest = 'sha256:' + createHash('sha256').update(sourceBytes).digest('hex');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listFileMetasWhere.mockResolvedValue([{
      id: 'catalog-asset',
      filename: 'demo/1/runtime.mjs',
      contentType: 'text/javascript',
      metadata: { pluginId: 'demo', version: '1', path: 'runtime.mjs' }
    }]);
    mocks.findFileMetaByFilename.mockResolvedValue(null);
    mocks.getFileBuffer.mockResolvedValue(sourceBytes);
    mocks.uploadFile.mockResolvedValue({ id: 'org-asset' });
    mocks.deleteFile.mockResolvedValue(true);
  });

  it('records a digest computed from the bytes copied into organization storage', async () => {
    await expect(materializePluginAssets('org-1', 'demo', '1')).resolves.toEqual({
      count: 1,
      assets: [{ path: 'runtime.mjs', contentHash: digest, bytes: sourceBytes.length }]
    });
    expect(mocks.getFileBuffer).toHaveBeenCalledWith('catalog-asset', PLUGIN_ASSETS_BUCKET);
    expect(mocks.uploadFile).toHaveBeenCalledWith(sourceBytes, 'org-1/demo/1/runtime.mjs', expect.objectContaining({
      organizationId: 'org-1',
      pluginId: 'demo',
      version: '1',
      path: 'runtime.mjs',
      contentHash: digest
    }), ORG_PLUGIN_ASSETS_BUCKET, 'text/javascript');
  });

  it('replaces an existing asset whose metadata claims the right digest but whose bytes are corrupt', async () => {
    mocks.findFileMetaByFilename.mockResolvedValue({
      id: 'existing-org-asset',
      length: 3,
      contentType: 'text/javascript',
      metadata: { contentHash: digest }
    });
    mocks.getFileBuffer.mockImplementation(async id => id === 'existing-org-asset' ? Buffer.from('bad') : sourceBytes);

    await materializePluginAssets('org-1', 'demo', '1');

    expect(mocks.deleteFile).toHaveBeenCalledWith('existing-org-asset', ORG_PLUGIN_ASSETS_BUCKET);
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing asset only after validating its actual bytes', async () => {
    mocks.findFileMetaByFilename.mockResolvedValue({
      id: 'existing-org-asset',
      length: sourceBytes.length,
      contentType: 'text/javascript',
      metadata: { contentHash: digest }
    });
    mocks.getFileBuffer.mockResolvedValue(sourceBytes);

    await expect(materializePluginAssets('org-1', 'demo', '1')).resolves.toEqual({
      count: 1,
      assets: [{ path: 'runtime.mjs', contentHash: digest, bytes: sourceBytes.length }]
    });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });
});
