import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedCassetteDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerAction.vue', () => ({ default: { name: 'GeneratedCassetteDesignerAction' } }));
vi.mock('~/components/SheetDesignEditor.vue', () => ({ default: { name: 'SheetDesignEditor' } }));
vi.mock('~/components/artifacts/SketchEditor.vue', () => ({ default: { name: 'SketchEditor' } }));
vi.mock('~/components/artifacts/ArtifactTextEditor.vue', () => ({ default: { name: 'ArtifactTextEditor' } }));

import {
  fileEditorActions,
  fileSurfaceRegistry,
  fileWorkspacePages,
  instancePayloadFileUrl,
  packEditorBindings,
  resolveFilePreview,
  resolveFileSurface,
  sketchInstancePersistence,
  textInstancePersistence,
  validateEditorBindings
} from './file-surfaces.js';

describe('file surface registry', () => {
  it('resolves every pack editor binding to a registered surface', () => {
    for (const editor of packEditorBindings) {
      const surface = resolveFileSurface(packEditorBindings, editor.type);
      expect(surface, editor.type).toBeTruthy();
      expect(surface.surface).toBe(editor.surface);
      expect(surface.modes).toEqual(editor.modes);
    }
  });

  it('rejects editor bindings whose surface id is absent from the registry', () => {
    expect(() => validateEditorBindings([
      { type: 'cassette', surface: 'no-such-surface', modes: ['edit'] }
    ])).toThrow(/type cassette references unknown surface no-such-surface/);
    expect(() => validateEditorBindings([
      { type: null, surface: null, modes: ['edit'] }
    ])).toThrow(/unknown surface/);
  });

  it('rejects two editor bindings for one type, naming both surfaces', () => {
    expect(() => validateEditorBindings([
      { type: 'cassette', surface: 'cassette-designer', modes: ['edit'] },
      { type: 'cassette', surface: 'sketch-editor', modes: ['edit'] }
    ])).toThrow(/duplicate editor binding for type cassette: surfaces cassette-designer and sketch-editor/);
  });

  it('validates the real pack bindings against the registry', () => {
    expect(validateEditorBindings(packEditorBindings)).toBe(packEditorBindings);
  });

  it('binds the cassette type to the cassette designer presentations', () => {
    const surface = resolveFileSurface(packEditorBindings, 'cassette');
    expect(surface.action).toBeTruthy();
    expect(surface.workspacePage).toMatchObject({ labelKey: 'cassette.designerTitle', icon: 'pi pi-file-edit' });
    expect(surface.workspacePage.props({ entity: { id: 'c-1' }, cassettes: [{ id: 'c-2' }] }, 'cassette'))
      .toEqual({ cassette: { id: 'c-1' }, cassettes: [{ id: 'c-2' }] });
  });

  it('binds sheet design to the editing workspace page', () => {
    const surface = resolveFileSurface(packEditorBindings, 'sheet-design');
    expect(surface.action).toBe('generic');
    expect(surface.workspacePage).toMatchObject({ labelKey: 'sheetDesign.editor' });
    expect(surface.workspacePage.props({ entity: { id: 'sd-1' } }, 'sheet-design'))
      .toEqual({ design: { id: 'sd-1' } });
  });

  it('derives editor action rows from the bindings', () => {
    const actions = new Map(fileEditorActions());
    expect(actions.get('cassette')?.action?.name).toBe('GeneratedCassetteDesignerAction');
    for (const typeId of ['sheet-design', 'sketch', 'text-document', 'csv-table']) {
      expect(actions.get(typeId)?.action, typeId).toBe('generic');
    }
  });

  it('derives a workspace page for every bound file type', () => {
    const pages = fileWorkspacePages();
    expect([...pages.map(page => page.id)].sort()).toEqual([
      'cassette-designer',
      'csv-editor',
      'sheet-design-editor',
      'sketch-editor',
      'text-editor'
    ]);
    expect([...pages.map(page => page.typeId)].sort()).toEqual([
      'cassette',
      'csv-table',
      'sheet-design',
      'sketch',
      'text-document'
    ]);
  });

  it('passes the bound type id into page props adapters', () => {
    const row = fileWorkspacePages().find(page => page.typeId === 'text-document');
    const props = row.props({ entity: { _id: 't-1' } });
    expect(props.format).toBe('text');
    expect(props.persistence.title).toBe('');
    expect(props.persistence.loadText).toBeInstanceOf(Function);
    expect(props.persistence.saveText).toBeInstanceOf(Function);
  });

  it('binds the sketch editor with an instance-backed persistence contract', () => {
    const surface = resolveFileSurface(packEditorBindings, 'sketch');
    const { persistence } = surface.workspacePage.props(
      { entity: { _id: 's-1', identity: { name: 'Marks' }, attachments: { primary: { fileId: 'f-9' } } } },
      'sketch'
    );
    expect(persistence.title).toBe('Marks');
    expect(persistence.origin).toBeUndefined();
    expect(persistence.loadScene).toBeInstanceOf(Function);
    expect(persistence.saveScene).toBeInstanceOf(Function);
  });

  it('builds the sketch persistence save against the instance payload route', async () => {
    const persistence = sketchInstancePersistence({ _id: 's-1', identity: { name: 'Marks' } }, 'sketch');
    expect(persistence.title).toBe('Marks');
    await expect(persistence.loadScene()).resolves.toBe('');
  });

  it('projects the generic instance persistence for text and csv formats', async () => {
    const text = textInstancePersistence({ _id: 't-1' }, 'text-document', 'text');
    expect(text.title).toBe('');
    await expect(text.loadText()).resolves.toBe('');
    expect(text.saveText).toBeInstanceOf(Function);

    const csv = textInstancePersistence({ _id: 'c-1' }, 'csv-table', 'csv');
    expect(csv.saveText).toBeInstanceOf(Function);
  });

  it('accepts served editor records in place of the pack import', () => {
    const served = [
      { type: 'cassette', surface: 'cassette-designer', modes: ['edit'] }
    ];
    expect(resolveFileSurface(served, 'cassette').modes).toEqual(['edit']);
    expect(resolveFileSurface(served, 'sheet-design')).toBeNull();
  });

  it('falls back to the pack bindings without a fetched type view', () => {
    // This spec runs without an active Pinia/app context, so the served
    // list cannot have been fetched: the documented pack fallback drives
    // the defaulted derivations.
    expect(resolveFileSurface(undefined, 'cassette').surface).toBe('cassette-designer');
    expect(fileWorkspacePages().map(row => row.typeId)).toContain('sketch');
    expect(new Map(fileEditorActions()).get('text-document')?.action).toBe('generic');
  });

  it('treats null editors as the active binding set', () => {
    // The editor action resolves its surface with no explicit list.
    expect(resolveFileSurface(null, 'cassette')?.surface).toBe('cassette-designer');
  });

  it('returns null for unknown types and unregistered surfaces', () => {
    expect(resolveFileSurface(packEditorBindings, 'queue')).toBeNull();
    expect(resolveFileSurface([{ type: 'x', surface: 'no-such-surface', modes: ['edit'] }], 'x')).toBeNull();
    expect(resolveFileSurface(packEditorBindings, '')).toBeNull();
    expect(Object.keys(fileSurfaceRegistry)).toEqual(expect.arrayContaining(['cassette-designer', 'sheet-design-editor', 'sketch-editor', 'text-editor', 'csv-editor']));
  });

  it('builds payload download URLs against the files bucket', () => {
    expect(instancePayloadFileUrl({ fileId: 'abc123' })).toBe('/api/files/download/abc123?bucket=files');
    expect(instancePayloadFileUrl({})).toBe('');
    expect(instancePayloadFileUrl(null)).toBe('');
  });

  it('resolves file previews from the payload traits', () => {
    const sketchType = { id: 'sketch', payload: { mime: ['application/json'], preview: 'sketch' } };
    const entity = { attachments: { primary: { fileId: 'f-1', mime: 'application/json' } } };
    expect(resolveFilePreview(entity, sketchType)).toMatchObject({
      mode: 'sketch',
      fileUrl: '/api/files/download/f-1?bucket=files',
      renderable: true,
      hasPayload: true
    });
  });

  it('falls back to attachment mode for payload types without authored preview', () => {
    const occsType = { id: 'cassette', payload: { mime: ['application/perigram+occs'] }, render: {} };
    const entity = { attachments: { primary: { fileId: 'f-2' } } };
    expect(resolveFilePreview(entity, occsType)).toMatchObject({
      mode: 'attachment',
      renderable: false,
      hasPayload: true
    });
  });

  it('renders nothing for payload-less entities and payload-less types', () => {
    const type = { id: 'sheet-design', render: {} };
    expect(resolveFilePreview({}, type).mode).toBe('none');
    expect(resolveFilePreview({}, null).mode).toBe('none');
    const payloadType = { id: 'sketch', payload: { preview: 'sketch' } };
    expect(resolveFilePreview({}, payloadType)).toMatchObject({ mode: 'sketch', hasPayload: false, fileUrl: '', renderable: true });
  });
});
