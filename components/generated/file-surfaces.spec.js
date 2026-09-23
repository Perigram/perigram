import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedCassetteDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerAction.vue', () => ({ default: { name: 'GeneratedCassetteDesignerAction' } }));
vi.mock('~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadeDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadePatternDesignerWorkspacePage' } }));
vi.mock('~/components/SheetDesignEditor.vue', () => ({ default: { name: 'SheetDesignEditor' } }));
vi.mock('~/components/artifacts/SketchEditor.vue', () => ({ default: { name: 'SketchEditor' } }));
vi.mock('~/components/artifacts/ArtifactTextEditor.vue', () => ({ default: { name: 'ArtifactTextEditor' } }));

import {
  fileDetailOverloads,
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
    expect(surface.detail.component).toBeTruthy();
    expect(surface.detail.ownsActionSurface).toBe(true);
    expect(surface.action).toBeTruthy();
    expect(surface.workspacePage).toMatchObject({ labelKey: 'cassette.designerTitle', icon: 'pi pi-pencil' });
    expect(surface.forcesIdentity).toBe(false);
    expect(surface.detail.props({ entity: { id: 'c-1' } })).toEqual({ cassette: { id: 'c-1' } });
    expect(surface.workspacePage.props({ entity: { id: 'c-1' }, cassettes: [{ id: 'c-2' }] }))
      .toEqual({ cassette: { id: 'c-1' }, cassettes: [{ id: 'c-2' }] });
  });

  it('binds sheet design to the editing surface with a write-grant prop', () => {
    const surface = resolveFileSurface(packEditorBindings, 'sheet-design');
    expect(surface.detail.component).toBeTruthy();
    expect(surface.detail.props({ entity: { id: 'sd-1' }, canEditSheetDesign: false }))
      .toEqual({ design: { id: 'sd-1' }, editable: false });
    expect(surface.action).toBeNull();
    expect(surface.workspacePage).toBeNull();
    expect(surface.forcesIdentity).toBe(true);
  });

  it('derives editor action rows from the bindings', () => {
    const actions = new Map(fileEditorActions());
    expect(actions.get('cassette')).toMatchObject({ forceIdentity: false });
    expect(actions.get('cassette').component).toBeTruthy();
    expect(actions.get('sheet-design')).toMatchObject({ component: null, forceIdentity: true });
    expect(actions.get('facade-design')).toMatchObject({ component: null, forceIdentity: false });
    expect(actions.get('facade-pattern')).toMatchObject({ component: null, forceIdentity: false });
    expect(actions.get('sketch')).toMatchObject({ component: null, forceIdentity: true });
    expect(actions.get('text-document')).toMatchObject({ component: null, forceIdentity: true });
    expect(actions.get('csv-table')).toMatchObject({ component: null, forceIdentity: true });
  });

  it('derives detail and workspace page rows only for surfaces with presentations', () => {
    const detailTypes = fileDetailOverloads().map(overload => overload.typeId).sort();
    expect(detailTypes).toEqual(['cassette', 'csv-table', 'facade-design', 'facade-pattern', 'sheet-design', 'sketch', 'text-document']);
    const pageIds = fileWorkspacePages().map(page => page.id);
    expect(pageIds).toEqual(['cassette-designer']);
    expect(fileWorkspacePages()[0].typeId).toBe('cassette');
  });

  it('passes the derived type id into detail props adapters', () => {
    const row = fileDetailOverloads().find(overload => overload.typeId === 'text-document');
    const props = row.props({ entity: { _id: 't-1' } });
    expect(props.format).toBe('text');
    expect(props.persistence.title).toBe('');
    expect(props.persistence.loadText).toBeInstanceOf(Function);
    expect(props.persistence.saveText).toBeInstanceOf(Function);
  });

  it('binds the sketch editor with an instance-backed persistence contract', () => {
    const surface = resolveFileSurface(packEditorBindings, 'sketch');
    expect(surface.detail.ownsActionSurface).toBe(true);
    expect(surface.forcesIdentity).toBe(true);
    const { persistence } = surface.detail.props({ entity: { _id: 's-1', identity: { name: 'Marks' }, attachments: { primary: { fileId: 'f-9' } } }, typeId: 'sketch' });
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
    expect(fileDetailOverloads().map(row => row.typeId)).toContain('sketch');
    expect(fileWorkspacePages().map(row => row.id)).toEqual(['cassette-designer']);
    expect(new Map(fileEditorActions()).get('text-document')).toMatchObject({ forceIdentity: true });
  });

  it('returns null for unknown types and unregistered surfaces', () => {
    expect(resolveFileSurface(packEditorBindings, 'queue')).toBeNull();
    expect(resolveFileSurface([{ type: 'x', surface: 'no-such-surface', modes: ['edit'] }], 'x')).toBeNull();
    expect(resolveFileSurface(packEditorBindings, '')).toBeNull();
    expect(Object.keys(fileSurfaceRegistry)).toEqual(expect.arrayContaining(['cassette-designer', 'sheet-design-editor', 'facade-designer', 'facade-pattern-designer', 'sketch-editor', 'text-editor', 'csv-editor']));
  });

  it('builds payload download URLs against the files bucket', () => {
    expect(instancePayloadFileUrl({ fileId: 'abc123' })).toBe('/api/files/download/abc123?bucket=files');
    expect(instancePayloadFileUrl({})).toBe('');
    expect(instancePayloadFileUrl(null)).toBe('');
  });

  it('resolves file previews from the type render policy', () => {
    const sketchType = { id: 'sketch', payload: { mime: ['application/json'] }, render: { preview: 'sketch' } };
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
    const payloadType = { id: 'sketch', payload: {}, render: { preview: 'sketch' } };
    expect(resolveFilePreview({}, payloadType)).toMatchObject({ mode: 'sketch', hasPayload: false, fileUrl: '', renderable: true });
  });
});
