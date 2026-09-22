import { describe, expect, it } from 'vitest';
import { resolveArtifactViewer } from '~/utils/artifact-viewer.js';

describe('ArtifactViewer behavior', () => {
  it('does not resolve a download request when no primary file exists', () => {
    expect(resolveArtifactViewer({ artifact: { _id: 'artifact-1', data: { type: 'PDF_DOCUMENT' } } }))
      .toEqual(expect.objectContaining({ hasFile: false, fileUrl: '', mode: 'pdf' }));
  });

  it.each([
    ['DXF_SOURCE', 'dxf'],
    ['PDF_DOCUMENT', 'pdf'],
    ['CSV_TABLE', 'table']
  ])('selects the declared %s preview', (type, mode) => {
    const viewer = resolveArtifactViewer({
      artifact: { _id: 'artifact-1', data: { type }, attachments: { primary: { fileId: 'file-1' } } }
    });
    expect(viewer).toEqual(expect.objectContaining({ hasFile: true, fileUrl: '/api/artifacts/artifact-1', mode }));
  });

  it('uses the selected revision file endpoint without changing the artifact kind', () => {
    const viewer = resolveArtifactViewer({
      artifact: { _id: 'artifact-1', data: { type: 'DXF_SOURCE' }, attachments: { primary: { fileId: 'latest' } } },
      revision: { _id: 'revision/old', attachments: { primary: { fileId: 'old' } } }
    });
    expect(viewer.fileUrl).toBe('/api/instance-revisions/revision%2Fold/file');
    expect(viewer.mode).toBe('dxf');
  });
});
