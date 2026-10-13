import { describe, expect, it } from 'vitest';
import { createTypeRegistry } from '~/packages/cts/src/index.js';
import { documentsPack, documentsTypes, documentsEditors, documentsServices, documentsCommands } from './index.js';

// The documents pack contract (SPEC §21): the generic file types compile
// through the real registry (R1–R6) with payload traits whose preview
// modes match the shared viewer modules; editor-replaceable types declare
// revision scopes.
describe('documents pack declarations', () => {
  it('compiles the pack types through the real CTS registry', () => {
    const registry = createTypeRegistry({ id: 'spec-documents' });
    for (const declaration of documentsTypes) registry.defineType(declaration);
    const compiled = registry.compile(null);
    expect(compiled.errors).toEqual([]);
    expect(compiled.ok).toBe(true);
  });

  it('declares preview modes the shared viewer modules render', () => {
    const renderable = ['dxf', 'svg', 'sketch', 'image', 'pdf', 'docx', 'table', 'workbook', 'text'];
    const byId = new Map(documentsTypes.map(type => [type.id, type.payload.preview]));
    for (const [id, preview] of byId) {
      // 'download' marks types without a reasonable bounded preview —
      // Word documents degrade to a payload download.
      if (preview === 'download') continue;
      expect(renderable, id).toContain(preview);
    }
    expect(Object.fromEntries(byId)).toEqual({
      image: 'image',
      'pdf-document': 'pdf',
      'text-document': 'text',
      'csv-table': 'table',
      'xlsx-workbook': 'workbook',
      'docx-document': 'download'
    });
  });

  it('keeps drawing/CAD formats out of the office/media pack', () => {
    const ids = documentsTypes.map(type => type.id);
    expect(ids).not.toContain('dxf-source');
    expect(ids).not.toContain('svg-file');
  });

  it('restricts payload traits to the declared document kinds', () => {
    // Text documents are markdown by default: the rich text editor
    // surface converts HTML <-> markdown on save/load.
    const text = documentsTypes.find(type => type.id === 'text-document');
    expect(text.payload).toMatchObject({ mime: ['text/markdown'], maxSize: 10 * 1024 * 1024 });
    const image = documentsTypes.find(type => type.id === 'image');
    expect(image.payload).toMatchObject({ mime: ['image/jpeg', 'image/png'], maxSize: 25 * 1024 * 1024 });
  });

  it('declares revision scopes only for editor-replaceable types', () => {
    const editedTypes = documentsEditors.map(editor => editor.type);
    for (const type of documentsTypes) {
      if (editedTypes.includes(type.id)) {
        expect(type.revisions, type.id).toBe('content');
      } else {
        expect(type.revisions, type.id).toBeUndefined();
      }
    }
  });

  it('binds the text and csv editor surfaces', () => {
    expect(documentsPack.editors).toEqual(documentsEditors);
    expect(documentsEditors).toContainEqual({ type: 'text-document', surface: 'text-editor', modes: ['edit'] });
    expect(documentsEditors).toContainEqual({ type: 'csv-table', surface: 'csv-editor', modes: ['edit'] });
  });

  it('declares the content creation protocol on the editable text payloads only', () => {
    const creation = Object.fromEntries(documentsTypes.map(type => [type.id, type.payload.creation || []]));
    expect(creation['text-document']).toEqual(['editor', 'content']);
    expect(creation['csv-table']).toEqual(['editor', 'content']);
    for (const [id, protocols] of Object.entries(creation)) {
      if (id !== 'text-document' && id !== 'csv-table') {
        expect(protocols, id).not.toContain('content');
      }
    }
  });

  it('declares the header-keyed and positional decompositions on both table types', () => {
    const projections = typeId => (documentsTypes.find(type => type.id === typeId).projections || []);
    for (const typeId of ['csv-table', 'xlsx-workbook']) {
      expect(projections(typeId).map(projection => projection.id)).toEqual(['rows', 'cells']);
      expect(projections(typeId).every(projection => projection.group === 'tableData'
        && projection.resolve.handler
        && projection.output.itemType.base === 'record')).toBe(true);
    }
    expect(projections('csv-table')[1].resolve.handler).toBe('documents.tableCells');
  });

  it('declares the text projection on the text document only', () => {
    const projections = typeId => (documentsTypes.find(type => type.id === typeId).projections || []);
    expect(projections('text-document')).toEqual([{
      id: 'text',
      label: 'Text',
      group: 'tableData',
      output: { base: 'string' },
      resolve: { handler: 'documents.text' }
    }]);
    for (const typeId of ['csv-table', 'xlsx-workbook', 'image', 'pdf-document', 'docx-document']) {
      expect(projections(typeId).some(projection => projection.id === 'text'), typeId).toBe(false);
    }
  });

  it('declares the csvText composition service with its command and tableData group', () => {
    expect(documentsServices).toEqual([{
      id: 'documents.csvText',
      command: 'documents.csvText',
      group: 'tableData',
      render: { label: 'CSV text', icon: 'pi pi-table' },
      signature: {
        input: { base: 'record', fields: { rows: { base: 'list', itemType: { base: 'record' } } } },
        output: { base: 'string' }
      }
    }]);
    expect(documentsPack.services).toEqual(documentsServices);
    expect(documentsCommands['documents.csvText']).toMatchObject({ id: 'documents.csvText', service: 'documents', action: 'csvText' });
    expect(documentsPack.domain.commands).toEqual(documentsCommands);
  });
});
