import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedCassetteDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerAction.vue', () => ({ default: { name: 'GeneratedCassetteDesignerAction' } }));
vi.mock('~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadeDesignerWorkspacePage' } }));
vi.mock('~/components/SheetDesignEditor.vue', () => ({ default: { name: 'SheetDesignEditor' } }));

import {
  fileDetailOverloads,
  fileEditorActions,
  fileSurfaceRegistry,
  fileWorkspacePages,
  instancePayloadFileUrl,
  packEditorBindings,
  resolveFilePreview,
  resolveFileSurface
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
  });

  it('derives detail and workspace page rows only for surfaces with presentations', () => {
    const detailTypes = fileDetailOverloads().map(overload => overload.entityType).sort();
    expect(detailTypes).toEqual(['cassette', 'facade-design', 'sheet-design']);
    const pageIds = fileWorkspacePages().map(page => page.id);
    expect(pageIds).toEqual(['cassette-designer']);
    expect(fileWorkspacePages()[0].entityType).toBe('cassette');
  });

  it('accepts served editor records in place of the pack import', () => {
    const served = [
      { type: 'cassette', surface: 'cassette-designer', modes: ['edit'] }
    ];
    expect(resolveFileSurface(served, 'cassette').modes).toEqual(['edit']);
    expect(resolveFileSurface(served, 'sheet-design')).toBeNull();
  });

  it('returns null for unknown types and unregistered surfaces', () => {
    expect(resolveFileSurface(packEditorBindings, 'queue')).toBeNull();
    expect(resolveFileSurface([{ type: 'x', surface: 'no-such-surface', modes: ['edit'] }], 'x')).toBeNull();
    expect(resolveFileSurface(packEditorBindings, '')).toBeNull();
    expect(Object.keys(fileSurfaceRegistry)).toEqual(expect.arrayContaining(['cassette-designer', 'sheet-design-editor', 'facade-designer']));
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
