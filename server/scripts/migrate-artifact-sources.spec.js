import { describe, expect, it } from 'vitest';
import {
  artifactDocumentForLegacyFile,
  migrateGeometryCaptureArtifact,
  migrateStaticDxfArtifact
} from './migrate-artifact-sources.js';

describe('artifact source migration', () => {
  it('adopts a capture file without copying it and links the capture', () => {
    const artifact = artifactDocumentForLegacyFile({
      artifactId: 'a1',
      attachment: { fileId: 'f1', bucketName: 'capturePhotos', name: 'photo.jpg' },
      type: 'CAPTURE_PHOTO',
      lineage: { organizationId: 'o1' }
    });
    const result = migrateGeometryCaptureArtifact({
      lineage: { organizationId: 'o1' },
      attachments: { primary: { fileId: 'f1' }, other: { fileId: 'f2' } },
      data: { sourcePhotoId: 'f1', mode: 'REMNANT' }
    }, artifact);
    expect(artifact.attachments.primary.fileId).toBe('f1');
    expect(result.capture.attachments).toEqual({ other: { fileId: 'f2' } });
    expect(result.capture.data).toEqual({ mode: 'REMNANT' });
    expect(result.capture.relations.sourcePhoto).toEqual({ type: 'artifact', id: 'a1' });
  });

  it('moves a static DXF source to an artifact relation and removes the raw source id', () => {
    const result = migrateStaticDxfArtifact({
      data: { geometry: { dxfId: 'f1', data: { polygonParts: [] } } }
    }, { _id: 'a1' });
    expect(result.entity.data.geometry).toEqual({ data: { polygonParts: [] } });
    expect(result.entity.relations.sourceDxf).toEqual({ type: 'artifact', id: 'a1' });
  });
});
