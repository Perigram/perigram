import { describe, expect, it } from 'vitest';
import { createTypeRegistry } from '~/packages/cts/src/index.js';
import { documentsPack, documentsTypes, documentsEditors } from './index.js';

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
      expect(renderable, id).toContain(preview);
    }
    expect(Object.fromEntries(byId)).toEqual({
      image: 'image',
      'pdf-document': 'pdf',
      'text-document': 'text',
      'csv-table': 'table',
      'svg-file': 'svg',
      'dxf-source': 'dxf',
      'xlsx-workbook': 'workbook',
      'docx-document': 'docx'
    });
  });

  it('restricts payload traits to the declared document kinds', () => {
    const text = documentsTypes.find(type => type.id === 'text-document');
    expect(text.payload).toMatchObject({ mime: ['text/plain'], maxSize: 10 * 1024 * 1024 });
    const dxf = documentsTypes.find(type => type.id === 'dxf-source');
    expect(dxf.payload).toMatchObject({ mime: ['application/dxf'], maxSize: 50 * 1024 * 1024 });
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
});
