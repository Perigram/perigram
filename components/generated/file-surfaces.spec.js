import { describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('~/packages/documents/src/editors/TextDocumentEditor.vue', () => ({ default: { name: 'TextDocumentEditor' } }));
vi.mock('~/packages/documents/src/editors/CsvTableEditor.vue', () => ({ default: { name: 'CsvTableEditor' } }));

import {
  fileEditorActions,
  fileSurfaceRegistry,
  fileWorkspacePages,
  instancePayloadFileUrl,
  packEditorBindings,
  resolveFilePreview,
  resolveFileSurface,
  textInstancePersistence,
  validateEditorBindings
} from './file-surfaces.js';

// The facade plugin's served editor layer (workers/facade/listing.json):
// cassette and sheet-design bindings arrive with the organization type
// view, not the always-mounted pack fallback. The sheet editor ships as
// a plugin-delivered surface module; the cassette designer is a local
// registration until its own migration.
const servedSurfaces = [
  { id: 'sheet-design-editor', url: 'http://127.0.0.1:8790/surfaces/sheet-design-editor.mjs', surfaceContract: 2 },
  { id: 'cassette-designer', url: 'http://127.0.0.1:8790/surfaces/cassette-designer.mjs', surfaceContract: 2 },
  { id: 'sketch-editor', url: 'http://127.0.0.1:8792/surfaces/sketch-editor.mjs', surfaceContract: 3 }
];
const servedEditors = [
  ...packEditorBindings,
  { type: 'cassette', surface: 'cassette-designer', modes: ['create', 'edit'] },
  { type: 'sheet-design', surface: 'sheet-design-editor', modes: ['edit'] },
  { type: 'sketch', surface: 'sketch-editor', modes: ['edit'] }
];

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
      { type: 'cassette', surface: 'csv-editor', modes: ['edit'] },
      { type: 'cassette', surface: 'text-editor', modes: ['edit'] }
    ])).toThrow(/duplicate editor binding for type cassette: surfaces csv-editor and text-editor/);
  });

  it('validates the real pack bindings against the registry', () => {
    expect(validateEditorBindings(packEditorBindings)).toBe(packEditorBindings);
  });

  it('binds the cassette type to the plugin-delivered designer module', () => {
    const surface = resolveFileSurface(servedEditors, 'cassette', servedSurfaces);
    expect(surface.action).toBe('generic');
    expect(surface.remote).toBe(true);
    expect(surface.workspacePage.props({ entity: { id: 'c-1' }, typeId: 'cassette' }, 'cassette'))
      .toMatchObject({ typeId: 'cassette', surface: servedSurfaces[1] });
  });

  it('binds sheet design to the plugin-delivered surface module', () => {
    const surface = resolveFileSurface(servedEditors, 'sheet-design', servedSurfaces);
    expect(surface.action).toBe('generic');
    expect(surface.remote).toBe(true);
    expect(surface.workspacePage.component).toBeTruthy();
    expect(surface.workspacePage.props(
      { entity: { id: 'sd-1' }, typeId: 'sheet-design' },
      'sheet-design'
    )).toMatchObject({ typeId: 'sheet-design', surface: servedSurfaces[0] });
  });

  it('derives editor action rows from the served bindings', () => {
    const actions = new Map(fileEditorActions(servedEditors, servedSurfaces));
    expect(actions.get('cassette')?.action).toBe('generic');
    for (const typeId of ['sheet-design', 'sketch', 'text-document', 'csv-table']) {
      expect(actions.get(typeId)?.action, typeId).toBe('generic');
    }
    // the pack fallback alone carries no facade bindings
    expect(new Map(fileEditorActions()).get('cassette')).toBeUndefined();
  });

  it('derives a workspace page for every bound file type', () => {
    const pages = fileWorkspacePages(servedEditors, servedSurfaces);
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

  it('marks the text/csv editor pages flush so the editor owns its shell', () => {
    const pages = new Map(fileWorkspacePages().map(page => [page.typeId, page]));
    expect(pages.get('text-document')?.flush).toBe(true);
    expect(pages.get('csv-table')?.flush).toBe(true);
    expect(resolveFileSurface(packEditorBindings, 'text-document')?.flush).toBe(true);
    expect(resolveFileSurface(packEditorBindings, 'csv-table')?.flush).toBe(true);
    expect(resolveFileSurface(packEditorBindings, 'sketch')?.flush).toBeUndefined();
  });

  it('passes the bound type id into page props adapters', () => {
    const row = fileWorkspacePages().find(page => page.typeId === 'text-document');
    const props = row.props({ entity: { _id: 't-1' } });
    expect(props.persistence.title).toBe('');
    expect(props.persistence.loadText).toBeInstanceOf(Function);
    expect(props.persistence.saveText).toBeInstanceOf(Function);
    expect(props.persistence.extension).toBe('.md');
  });

  it('projects the generic instance persistence for text and csv formats', async () => {
    const text = textInstancePersistence({ _id: 't-1' }, 'text-document', 'text');
    expect(text.title).toBe('');
    await expect(text.loadText()).resolves.toBe('');
    expect(text.saveText).toBeInstanceOf(Function);

    const csv = textInstancePersistence({ _id: 'c-1' }, 'csv-table', 'csv');
    expect(csv.saveText).toBeInstanceOf(Function);
  });

  it('resolves the payload store-first so reloads serve the current revision', async () => {
    // Every save writes a new payload file; a persistence built at
    // mount holds the old reference. The load must prefer the store's
    // record (kept fresh by the save event's snapshot) over the stale
    // closure payload.
    setActivePinia(createPinia());
    const { useInstancesStore } = await import('~/stores/instances');
    const instances = useInstancesStore();
    instances.upsertRecord('text-document', { _id: 't-9', payload: { fileId: 'file-new' } });

    const stale = textInstancePersistence({ _id: 't-9', payload: { fileId: 'file-old' } }, 'text-document', 'text');
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async url => {
      urls.push(String(url));
      return { ok: true, text: async () => 'fresh text' };
    }));
    try {
      await expect(stale.loadText()).resolves.toBe('fresh text');
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('file-new');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('builds the blank-page persistence against a null entity', async () => {
    // The blank editor page passes entity: null (no record until the
    // first save) — the adapter must coerce it, not crash on `._id`.
    const blank = textInstancePersistence(null, 'text-document', 'text');
    expect(blank.title).toBe('');
    expect(blank.extension).toBe('.md');
    await expect(blank.loadText()).resolves.toBe('');
    expect(blank.saveText).toBeInstanceOf(Function);
    expect(blank.rename).toBeInstanceOf(Function);

  });

  it('resolves served plugin surface declarations beside the local registry', () => {
    const editors = [{ type: 'coating-sheet', surface: 'coating-designer', modes: ['edit'] }];
    const surfaces = [{ id: 'coating-designer', url: 'http://127.0.0.1:8799/surfaces/coating-designer.mjs', surfaceContract: 1 }];
    const resolved = resolveFileSurface(editors, 'coating-sheet', surfaces);
    expect(resolved).toMatchObject({ surface: 'coating-designer', action: 'generic', remote: true });
    expect(resolved.workspacePage.component).toBeTruthy();
    const page = resolved.workspacePage.props({ entity: { _id: 'c-1' } });
    expect(page).toMatchObject({ typeId: 'coating-sheet' });
    expect(page.surface).toEqual(surfaces[0]);
    expect(page.record?._id).toBe('c-1');
    // Without the declarations the binding has no presentation.
    expect(resolveFileSurface(editors, 'coating-sheet', [])).toBeNull();
    // Derived rows carry remote surfaces through.
    const actions = new Map(fileEditorActions(editors, surfaces));
    expect(actions.get('coating-sheet')?.action).toBe('generic');
    const pages = fileWorkspacePages(editors, surfaces);
    expect(pages.map(page => page.id)).toContain('coating-designer');
  });

  it('accepts served editor records in place of the pack import', () => {
    const served = [
      { type: 'sketch', surface: 'sketch-editor', modes: ['edit'] }
    ];
    expect(resolveFileSurface(served, 'sketch', servedSurfaces).modes).toEqual(['edit']);
    expect(resolveFileSurface(served, 'sheet-design', servedSurfaces)).toBeNull();
  });

  it('falls back to the pack bindings without a fetched type view', () => {
    // This spec runs without an active Pinia/app context, so the served
    // list cannot have been fetched: the always-mounted pack fallback
    // drives the defaulted derivations — and carries no facade bindings
    // (the installed plugin layer serves those).
    expect(resolveFileSurface(undefined, 'sketch')).toBeNull();
    expect(resolveFileSurface(undefined, 'cassette')).toBeNull();
    expect(fileWorkspacePages().map(row => row.typeId)).not.toContain('sketch');
    expect(new Map(fileEditorActions()).get('text-document')?.action).toBe('generic');
  });

  it('treats null editors as the active binding set', () => {
    // The editor action resolves its surface with no explicit list.
    expect(resolveFileSurface(null, 'sketch')).toBeNull();
    expect(resolveFileSurface(null, 'cassette')).toBeNull();
  });

  it('returns null for unknown types and unregistered surfaces', () => {
    expect(resolveFileSurface(packEditorBindings, 'queue')).toBeNull();
    expect(resolveFileSurface([{ type: 'x', surface: 'no-such-surface', modes: ['edit'] }], 'x')).toBeNull();
    expect(resolveFileSurface(packEditorBindings, '')).toBeNull();
    expect(Object.keys(fileSurfaceRegistry)).toEqual(expect.arrayContaining(['text-editor', 'csv-editor']));
  });

  it('builds payload download URLs against the files bucket', () => {
    expect(instancePayloadFileUrl({ fileId: 'abc123' })).toBe('/api/files/download/abc123?bucket=files');
    expect(instancePayloadFileUrl({})).toBe('');
    expect(instancePayloadFileUrl(null)).toBe('');
  });

  it('resolves file previews from the payload traits', () => {
    const sketchType = { id: 'sketch', payload: { mime: ['application/json'], preview: 'sketch' } };
    const entity = { payload: { fileId: 'f-1', mime: 'application/json' } };
    expect(resolveFilePreview(entity, sketchType)).toMatchObject({
      mode: 'sketch',
      fileUrl: '/api/files/download/f-1?bucket=files',
      renderable: true,
      hasPayload: true
    });
  });

  it('falls back to attachment mode for payload types without authored preview', () => {
    const occsType = { id: 'cassette', payload: { mime: ['application/perigram+occs'] }, render: {} };
    const entity = { payload: { fileId: 'f-2' } };
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
