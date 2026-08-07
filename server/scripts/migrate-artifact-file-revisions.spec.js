import { describe, expect, it } from 'vitest';
import { revisionDocument } from './migrate-artifact-file-revisions.js';

describe('artifact file revision migration', () => {
  it('creates a retained v1 revision from the current attachment', () => {
    const revision = revisionDocument({
      _id: 'artifact-1', identity: { name: 'Quote' }, lineage: { organizationId: 'org-1' },
      attachments: { primary: { fileId: 'file-1', name: 'quote.txt', metadata: { bucketName: 'uploads' } } }, data: { type: 'TEXT_FILE' }
    });
    expect(revision.data).toMatchObject({ source: { type: 'artifact', id: 'artifact-1' }, scope: 'file', number: 1 });
    expect(revision.attachments.primary.fileId).toBe('file-1');
  });
});
