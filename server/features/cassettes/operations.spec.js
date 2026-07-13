import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  artifactCreate: vi.fn(),
  artifactGet: vi.fn(),
  fileStream: vi.fn(),
  upload: vi.fn()
}));

vi.mock('h3', () => ({
  createError: ({ message, statusCode }) => Object.assign(new Error(message), { statusCode })
}));
vi.mock('../artifacts/service.js', () => ({
  create: mocks.artifactCreate,
  getById: mocks.artifactGet
}));
vi.mock('../files/service.js', () => ({ getFileStream: mocks.fileStream }));
vi.mock('./service.js', () => ({ upload: mocks.upload }));

import { importCassetteDesign } from './operations.js';

describe('cassette import operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const artifact = {
      _id: 'artifact-1',
      identity: { name: 'panel.dxf' },
      attachments: {
        primary: {
          fileId: 'file-1',
          name: 'panel.dxf',
          metadata: { bucketName: 'uploads' }
        }
      }
    };
    mocks.artifactCreate.mockResolvedValue(artifact);
    mocks.artifactGet.mockResolvedValue(artifact);
    mocks.fileStream.mockResolvedValue(Readable.from([Buffer.from('DXF')]));
    mocks.upload.mockResolvedValue({ template: { _id: 'template-1' }, design: { _id: 'design-1' } });
  });

  it('persists a direct DXF attachment as an artifact before importing it', async () => {
    const auth = { userId: 'user-1', organizationId: 'org-1', role: 'member' };
    const result = await importCassetteDesign({
      parameters: {
        name: 'Panel',
        file: { fileId: 'file-1', filename: 'panel.dxf', bucketName: 'uploads' },
        layerMapping: { CUT: 'cut.outer' }
      },
      auth
    });

    expect(mocks.artifactCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'panel.dxf',
      type: 'DXF_UPLOAD'
    }), 'user-1', 'org-1', 'member', auth);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      'panel.dxf',
      'Panel',
      'user-1',
      'org-1',
      'member',
      auth,
      { CUT: 'cut.outer' },
      []
    );
    expect(result.entities).toEqual([
      { type: 'cassette', id: 'template-1' },
      { type: 'cassette_design', id: 'design-1' }
    ]);
  });
});
