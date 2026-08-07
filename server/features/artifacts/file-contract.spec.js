import { describe, expect, it } from 'vitest';
import { validateArtifactFile } from './file-contract.js';

const kind = { file: { extensions: ['.txt'], mimeTypes: ['text/plain'], maxBytes: 4 } };

describe('artifact file contract', () => {
  it('accepts a matching file', () => {
    expect(() => validateArtifactFile(kind, { buffer: Buffer.from('ok'), filename: 'note.txt', mimeType: 'text/plain' })).not.toThrow();
  });

  it('rejects wrong extensions, MIME types, and size', () => {
    expect(() => validateArtifactFile(kind, { buffer: Buffer.from('ok'), filename: 'note.csv', mimeType: 'text/plain' })).toThrow();
    expect(() => validateArtifactFile(kind, { buffer: Buffer.from('ok'), filename: 'note.txt', mimeType: 'text/csv' })).toThrow();
    expect(() => validateArtifactFile(kind, { buffer: Buffer.from('large'), filename: 'note.txt', mimeType: 'text/plain' })).toThrow();
  });
});
