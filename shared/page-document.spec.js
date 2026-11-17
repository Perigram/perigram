import { describe, expect, it } from 'vitest';
import { blocksFromMarkdown, normalizePageDocument, normalizePageFilePath } from './page-document.js';

describe('page document', () => {
  it('splits markdown into ordered text and view blocks', () => {
    const document = blocksFromMarkdown('Intro\n\n```view\n{"typeId":"widget","name":"Widgets"}\n```\n\nOutro\n');
    expect(document.blocks.map(block => block.kind)).toEqual(['text', 'view', 'text']);
    expect(document.order).toEqual(document.blocks.map(block => block.id));
    expect(document.blocks[1].view).toMatchObject({ typeId: 'widget', name: 'Widgets' });
  });


  it('preserves page file blocks with safe logical paths and canonical file refs', () => {
    const document = normalizePageDocument({
      blocks: [
        { id: 'file-1', kind: 'file', file: { path: 'models/part.glb', fileId: 'blob-1', bucket: 'uploads', mime: 'model/gltf-binary', size: 120, revision: 2 } },
        { id: 'bad-path', kind: 'file', file: { path: '../secret.txt', fileId: 'blob-2' } },
        { id: 'bad-id', kind: 'file', file: { path: 'notes/readme.txt' } }
      ],
      order: ['file-1', 'bad-path', 'bad-id']
    });
    expect(document.order).toEqual(['file-1']);
    expect(document.blocks).toEqual([{
      id: 'file-1',
      kind: 'file',
      file: {
        path: 'models/part.glb',
        fileId: 'blob-1',
        bucket: 'files',
        name: 'part.glb',
        mime: 'model/gltf-binary',
        size: 120,
        revision: 2,
        history: []
      }
    }]);
  });

  it('normalizes typed live and pinned references without accepting malformed identities', () => {
    const document = normalizePageDocument({ blocks: [
      { id: 'live', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-1' } },
      { id: 'pinned', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-2', revisionId: 'revision:part:part-2:content:3' } },
      { id: 'bad-type', kind: 'reference', ref: { typeId: '../files', instanceId: 'x' } },
      { id: 'bad-id', kind: 'reference', ref: { typeId: 'part', instanceId: '' } }
    ], order: ['live', 'pinned', 'bad-type', 'bad-id'] });
    expect(document.order).toEqual(['live', 'pinned']);
    expect(document.blocks).toEqual([
      { id: 'live', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-1' } },
      { id: 'pinned', kind: 'reference', ref: { typeId: 'part', instanceId: 'part-2', revisionId: 'revision:part:part-2:content:3' } }
    ]);
  });

  it('rejects unsafe, absolute, empty, and overlong logical paths', () => {
    expect(normalizePageFilePath('models/part.glb')).toBe('models/part.glb');
    expect(normalizePageFilePath('../part.glb')).toBe('');
    expect(normalizePageFilePath('/part.glb')).toBe('');
    expect(normalizePageFilePath('models//part.glb')).toBe('');
    expect(normalizePageFilePath('models\\part.glb')).toBe('');
    expect(normalizePageFilePath('a'.repeat(241))).toBe('');
  });

  it('keeps only ordered, known blocks and appends missing order entries', () => {
    const document = normalizePageDocument({
      blocks: [
        { id: 'a', kind: 'text', text: 'A' },
        { id: 'b', kind: 'view', view: { typeId: 'w', name: 'W' } },
        { id: 'c', kind: 'text', text: 'C' }
      ],
      order: ['b', 'missing', 'b']
    });
    expect(document.order).toEqual(['b', 'a', 'c']);
    expect(document.blocks).toHaveLength(3);
  });
});
