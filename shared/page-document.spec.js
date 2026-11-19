import { describe, expect, it } from 'vitest';
import { blocksFromMarkdown, normalizePageDocument, normalizePageFilePath } from './page-document.js';

describe('page document', () => {
  it('splits markdown into ordered text and view blocks', () => {
    const document = blocksFromMarkdown('Intro\n\n```view\n{"typeId":"widget","name":"Widgets"}\n```\n\nOutro\n');
    expect(document.blocks.map(block => block.kind)).toEqual(['text', 'view', 'text']);
    expect(document.order).toEqual(document.blocks.map(block => block.id));
    expect(document.blocks[1].view).toMatchObject({ typeId: 'widget', name: 'Widgets' });
  });


  it('preserves a pinned saved-query definition snapshot on a collection embed', () => {
    const document = normalizePageDocument({ blocks: [{ id: 'pinned-view', kind: 'view', view: { id: 'view-1', typeId: 'part', name: 'Approved parts', definitionRevision: '2026-11-17T08:00:00.000Z', definitionSnapshot: { viewState: { filters: { code: 'A' }, sort: { name: 'createdAt', order: -1 } } } } }], order: ['pinned-view'] });
    expect(document.blocks[0].view).toMatchObject({ id: 'view-1', parameters: {}, resultPolicy: 'live', definitionRevision: '2026-11-17T08:00:00.000Z', definitionSnapshot: { viewState: { filters: { code: 'A' }, sort: { name: 'createdAt', order: -1 } } } });
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

  it('normalizes pinned graph-output collection references with explicit parameters', () => {
    const document = normalizePageDocument({ blocks: [{ id: 'graph-output', kind: 'collection', collection: { source: { kind: 'graph-output', executionInstanceId: 'execution-instance-1', graphDocumentInstanceId: 'graph-document-1', graphId: 'graph.report', graphRevision: 'rev-2', outputId: 'rows' }, parameters: { limit: 20 }, resultPolicy: 'live' } }], order: ['graph-output'] });
    expect(document.blocks[0]).toMatchObject({ kind: 'collection', collection: { source: { kind: 'graph-output', executionInstanceId: 'execution-instance-1', graphDocumentInstanceId: 'graph-document-1', graphId: 'graph.report', graphRevision: 'rev-2', outputId: 'rows' }, parameters: { limit: 20 }, resultPolicy: 'pinned' } });
  });

  it('retains a frozen collection snapshot and its frozen result policy', () => {
    const items = [{ kind: 'value', value: 'row' }];
    const document = normalizePageDocument({ blocks: [
      { id: 'frozen', kind: 'collection', collection: { source: { kind: 'graph-output', executionInstanceId: 'e1', graphDocumentInstanceId: 'g1', graphId: 'graph.report', graphRevision: 'rev-2', outputId: 'rows' }, parameters: {}, snapshot: { label: 'Rows', itemCount: 1, truncated: false, items }, resultPolicy: 'frozen' } },
      { id: 'not-frozen', kind: 'collection', collection: { source: { kind: 'graph-output', executionInstanceId: 'e2', graphDocumentInstanceId: 'g1', graphId: 'graph.report', graphRevision: 'rev-2', outputId: 'rows' }, parameters: {}, snapshot: { label: 'No items' } } }
    ], order: ['frozen', 'not-frozen'] });
    expect(document.blocks[0].collection).toMatchObject({ resultPolicy: 'frozen', snapshot: { label: 'Rows', itemCount: 1, truncated: false, items } });
    expect(document.blocks[1].collection).toMatchObject({ resultPolicy: 'pinned' });
    expect(document.blocks[1].collection.snapshot).toBeUndefined();
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
