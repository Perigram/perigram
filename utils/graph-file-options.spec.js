import { describe, expect, it } from 'vitest';
import { graphFileOptions } from './graph-file-options.js';

describe('graph file input options', () => {
  it('lists only readable file instances carrying a file payload reference', () => {
    const options = graphFileOptions(['text-document', 'pdf-document'], {
      'text-document': {
        text: { id: 'text-1', fields: { name: 'report.md' }, payload: { fileId: 'blob-1' } },
        empty: { id: 'text-2', fields: { name: 'empty.md' }, payload: null }
      },
      'pdf-document': {
        pdf: { id: 'pdf-1', fields: { name: 'scan.pdf' }, payload: { fileId: 'blob-2' } }
      }
    });
    expect(options).toEqual([
      expect.objectContaining({ id: 'text-1', typeId: 'text-document', payload: { fileId: 'blob-1' } }),
      expect.objectContaining({ id: 'pdf-1', typeId: 'pdf-document', payload: { fileId: 'blob-2' } })
    ]);
  });
});
