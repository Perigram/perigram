import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import {
  editorMountMode,
  fileSurfaceRegistry,
  fileWorkspacePages,
  frameworkEditorBindings,
  instancePayloadFileUrl,
  instancePayloadPersistence,
  packEditorBindings,
  resolveFilePreview,
  resolveFileSurface,
  validateEditorBindings
} from './file-surfaces.js';
import { resolveAttachmentPeek } from './file-preview-contract.js';

// The served editor layer (the plugins' listings): every served file
// editor is plugin-delivered (documents, tech-drawing, facade — owner
// decision 2026-10-17); the pack fallback stays empty and the local
// registry carries the app-owned graph editor alone.
const servedSurfaces = [
  { id: 'text-editor', url: 'http://127.0.0.1:8791/surfaces/text-editor.mjs', surfaceContract: 3 },
  { id: 'csv-editor', url: 'http://127.0.0.1:8791/surfaces/csv-editor.mjs', surfaceContract: 3 },
  { id: 'sheet-design-editor', url: 'http://127.0.0.1:8790/surfaces/sheet-design-editor.mjs', surfaceContract: 2 },
  { id: 'cassette-designer', url: 'http://127.0.0.1:8790/surfaces/cassette-designer.mjs', surfaceContract: 2 },
  { id: 'sketch-editor', url: 'http://127.0.0.1:8792/surfaces/sketch-editor.mjs', surfaceContract: 3 }
];
const servedEditors = [
  { type: 'text-document', surface: 'text-editor', modes: ['edit'] },
  { type: 'csv-table', surface: 'csv-editor', modes: ['edit'] },
  { type: 'cassette', surface: 'cassette-designer', modes: ['create', 'edit'] },
  { type: 'sheet-design', surface: 'sheet-design-editor', modes: ['edit'] },
  { type: 'sketch', surface: 'sketch-editor', modes: ['edit'] }
];

describe('file surface registry', () => {
  // The remote props adapter resolves the mount mode through the auth
  // store, so every test runs against a fresh pinia.
  beforeEach(() => setActivePinia(createPinia()));

  it('registers the app-owned graph editor beside the empty pack fallback', () => {
    // Every served editor is plugin-delivered; the local registry
    // carries the platform's own graph canvas surface (SPEC §28).
    expect(Object.keys(fileSurfaceRegistry)).toEqual(['graph-editor']);
    expect(fileSurfaceRegistry['graph-editor'].workspacePage.labelKey).toBe('processDesigner.graphDocument');
    expect(packEditorBindings).toEqual([]);
    expect(frameworkEditorBindings).toEqual([{ type: 'graph-document', surface: 'graph-editor', modes: ['edit'] }]);
    expect(validateEditorBindings([])).toEqual([]);
  });

  it('resolves the graph-document editor page and its mount props', async () => {
    const { useAuthStore } = await import('~/stores/auth');
    const authStore = useAuthStore();
    authStore.user = { permissions: { 'graph-document': 'write' } };
    const surface = resolveFileSurface(frameworkEditorBindings, 'graph-document', []);
    expect(surface.remote).toBeUndefined();
    expect(surface.workspacePage.direct).toBe(true);
    expect(surface.workspacePage.ownsChrome).toBe(true);
    expect(surface.workspacePage.component).toBeTruthy();
    expect(surface.workspacePage.props({ entity: { _id: 'g-1', name: 'Fixture graph' } }))
      .toEqual({ graphInstanceId: 'g-1' });
    expect(surface.workspacePage.props({ entity: null })).toEqual({ graphInstanceId: 'blank' });
    const pages = fileWorkspacePages(frameworkEditorBindings, []);
    const graphPage = pages.find(page => page.id === 'graph-editor');
    expect(graphPage.flush).toBe(true);
    expect(graphPage.recordHeader).toBe(true);
    expect(graphPage.component).toBe(surface.workspacePage.component);
    expect(graphPage.props({ entity: { _id: 'g-2' } })).toEqual({ graphInstanceId: 'g-2' });
  });

  it('rejects editor bindings whose surface id is absent from the registry', () => {
    expect(() => validateEditorBindings([
      { type: 'cassette', surface: 'no-such-surface', modes: ['edit'] }
    ])).toThrow(/type cassette references unknown surface no-such-surface/);
    expect(() => validateEditorBindings([
      { type: null, surface: null, modes: ['edit'] }
    ])).toThrow(/unknown surface/);
  });

  it('binds the cassette type to the plugin-delivered designer module', () => {
    const surface = resolveFileSurface(servedEditors, 'cassette', servedSurfaces);
    expect(surface.remote).toBe(true);
    expect(surface.action).toBeUndefined();
    expect(surface.workspacePage.props({ entity: { id: 'c-1' }, typeId: 'cassette' }, 'cassette'))
      .toMatchObject({ typeId: 'cassette', surface: servedSurfaces[3] });
  });

  it('binds the text and csv editors to the documents plugin surfaces', () => {
    for (const [typeId, surfaceId] of [['text-document', 'text-editor'], ['csv-table', 'csv-editor']]) {
      const surface = resolveFileSurface(servedEditors, typeId, servedSurfaces);
      expect(surface.remote, typeId).toBe(true);
      expect(surface.workspacePage.component, typeId).toBeTruthy();
      expect(surface.workspacePage.props({ entity: { id: 'd-1' }, typeId }, typeId))
        .toMatchObject({ typeId, surface: servedSurfaces.find(entry => entry.id === surfaceId) });
    }
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

  it('projects the generic instance persistence for text formats', async () => {
    const text = instancePayloadPersistence({ _id: 't-1' }, 'text-document', 'text/markdown');
    expect(text.title).toBe('');
    await expect(text.load()).resolves.toBe('');
    expect(text.save).toBeInstanceOf(Function);
    expect(text.rename).toBeInstanceOf(Function);
    expect(text.recordExecution).toBeInstanceOf(Function);
    expect(text.bakeFile).toBeInstanceOf(Function);
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

    const stale = instancePayloadPersistence({ _id: 't-9', payload: { fileId: 'file-old' } }, 'text-document', 'text/markdown');
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async url => {
      urls.push(String(url));
      return { ok: true, text: async () => 'fresh text' };
    }));
    try {
      await expect(stale.load()).resolves.toBe('fresh text');
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('file-new');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('builds the blank-page persistence against a null entity', async () => {
    // The blank editor page passes entity: null (no record until the
    // first save) — the adapter must coerce it, not crash on `._id`.
    const blank = instancePayloadPersistence(null, 'text-document', 'text/markdown');
    expect(blank.title).toBe('');
    await expect(blank.load()).resolves.toBe('');
    expect(blank.save).toBeInstanceOf(Function);
    expect(blank.rename).toBeInstanceOf(Function);
  });

  it('resolves served plugin surface declarations beside the local registry', () => {
    const editors = [{ type: 'coating-sheet', surface: 'coating-designer', modes: ['edit'] }];
    const surfaces = [{ id: 'coating-designer', url: 'http://127.0.0.1:8793/s.mjs', surfaceContract: 1 }];
    const surface = resolveFileSurface(editors, 'coating-sheet', surfaces);
    expect(surface.remote).toBe(true);
    const pages = fileWorkspacePages(editors, surfaces);
    expect(pages.map(page => page.id)).toContain('coating-designer');
  });

  it('keys the mount mode on the opener write grant', async () => {
    setActivePinia(createPinia());
    const { useAuthStore } = await import('~/stores/auth');
    const authStore = useAuthStore();
    authStore.user = { permissions: { 'text-document': 'write' } };
    expect(editorMountMode('text-document', { id: 't-1' })).toBe('edit');
    authStore.user = { permissions: { 'text-document': 'read' } };
    expect(editorMountMode('text-document', { id: 't-1' })).toBe('read');
  });

  it('answers unknown types and unfetched views with null', () => {
    expect(resolveFileSurface(servedEditors, 'queue', servedSurfaces)).toBeNull();
    expect(resolveFileSurface([{ type: 'x', surface: 'no-such-surface', modes: ['edit'] }], 'x')).toBeNull();
    expect(resolveFileSurface(servedEditors, 'text-document')).toBeNull();
    expect(resolveFileSurface(null, 'text-document')).toBeNull();
    expect(resolveFileSurface(null, 'cassette')).toBeNull();
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

  it('previews graph documents visually from their dedicated extension', () => {
    const graphType = { id: 'graph-document', payload: { mime: ['application/json'], preview: 'graph' } };
    const entity = { payload: { fileId: 'f-graph', mime: 'application/json', name: 'Assembly.perigram-graph' } };
    expect(resolveFilePreview(entity, graphType)).toMatchObject({ mode: 'graph', renderable: true });
    expect(resolveAttachmentPeek(entity.payload)).toMatchObject({ mode: 'graph', fileUrl: '/api/files/download/f-graph?bucket=files' });
    expect(resolveAttachmentPeek({ fileId: 'f-json', mime: 'application/json', name: 'notes.json' }).mode).toBe('text');
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
