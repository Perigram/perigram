import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../occs/profiles.js', () => ({
  resolveOccsProfileSketchLayerData: vi.fn()
}));
vi.mock('./lib/cassetteV2Renderer.js', () => ({
  renderCassetteV2TreeToDrawing: vi.fn()
}));
vi.mock('./lib/drawingPreview.js', () => ({
  normalizeGeometryDrawing: vi.fn(),
  cassettePreviewLayerSelection: vi.fn(() => ['outline'])
}));

import { resolveOccsProfileSketchLayerData } from '../occs/profiles.js';
import { renderCassetteV2TreeToDrawing } from './lib/cassetteV2Renderer.js';
import { normalizeGeometryDrawing } from './lib/drawingPreview.js';
import createCassettePreview from './cassette-preview.mjs';
import createProfilePreview from './profile-preview.mjs';

function mountContext() {
  let pending = Promise.resolve();
  const h = (tag, props, children) => ({ tag, props, children });
  const ref = value => ({ value });
  const computed = getter => ({ get value() { return getter(); } });
  const watch = (_source, callback, options = {}) => {
    if (options.immediate) pending = Promise.resolve().then(callback);
  };
  return {
    context: {
      vue: { h, ref, computed, watch },
      components: { DrawingCanvas: 'DrawingCanvas', ProgressSpinner: 'ProgressSpinner' }
    },
    settle: () => pending
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveOccsProfileSketchLayerData.mockResolvedValue({ paths: [] });
  renderCassetteV2TreeToDrawing.mockResolvedValue({ paths: [] });
  normalizeGeometryDrawing.mockImplementation(input => ({ normalized: input }));
});

describe('Facade preview surfaces', () => {
  it('renders a cassette OCCS document through the same drawing renderer', async () => {
    const mount = mountContext();
    const surface = createCassettePreview(mount.context);
    const graphTree = { nodes: [{ id: 'base' }] };
    const render = surface.setup({
      record: { _id: 'cassette-1', updatedAt: 1, fields: {}, payload: { mime: 'application/perigram+occs', fileId: 'f1' } },
      payload: { occs: {}, documentType: 'cassette', extensions: { perigram: { graphTree } } }
    });
    await mount.settle();
    const tree = render();
    expect(renderCassetteV2TreeToDrawing).toHaveBeenCalledWith(graphTree);
    expect(tree.children[0].tag).toBe('DrawingCanvas');
    expect(tree.children[0].props.source).toEqual({ paths: [] });
  });

  it('renders a baked cassette geometry payload through the drawing normalizer', async () => {
    const mount = mountContext();
    const surface = createCassettePreview(mount.context);
    const geometry = { outlines: [[0, 0], [10, 10]] };
    const render = surface.setup({
      record: { _id: 'cassette-2', updatedAt: 2, fields: { geometry: { data: geometry } } },
      payload: null
    });
    await mount.settle();
    const tree = render();
    expect(normalizeGeometryDrawing).toHaveBeenCalledWith({ data: { geometry: { data: geometry } } });
    expect(tree.children[0].tag).toBe('DrawingCanvas');
  });

  it('degrades malformed baked cassette geometry to the quiet empty preview', async () => {
    normalizeGeometryDrawing.mockImplementationOnce(() => { throw new Error('invalid geometry'); });
    const mount = mountContext();
    const surface = createCassettePreview(mount.context);
    const render = surface.setup({
      record: { _id: 'cassette-invalid', updatedAt: 4, fields: { geometry: { data: { invalid: true } } } },
      payload: null
    });
    await expect(mount.settle()).resolves.toBeUndefined();
    const tree = render();
    expect(tree.children[0].tag).toBe('div');
    expect(tree.children[0].children[0].tag).toBe('i');
  });

  it('keeps the cassette payload loading state visible while OCCS bytes are unresolved', async () => {
    normalizeGeometryDrawing.mockReturnValue(null);
    const mount = mountContext();
    const surface = createCassettePreview(mount.context);
    const render = surface.setup({
      record: { _id: 'cassette-3', updatedAt: 3, fields: {}, payload: { fileId: 'f2', mime: 'application/perigram+occs' } },
      payload: null
    });
    await mount.settle();
    const tree = render();
    expect(tree.children[0].tag).toBe('ProgressSpinner');
  });

  it('renders evaluated profile sketches through the drawing normalizer', async () => {
    const mount = mountContext();
    const surface = createProfilePreview(mount.context);
    const sketch = { type: 'profile-sketch' };
    const render = surface.setup({
      record: { _id: 'profile-1', updatedAt: 1, fields: { sketch } },
      payload: null
    });
    await mount.settle();
    const tree = render();
    expect(resolveOccsProfileSketchLayerData).toHaveBeenCalledWith(sketch);
    expect(normalizeGeometryDrawing).toHaveBeenCalledWith({ data: { layerData: { paths: [] } } });
    expect(tree.children[0].tag).toBe('DrawingCanvas');
  });

  it('degrades a failed profile sketch evaluation to the quiet empty preview', async () => {
    resolveOccsProfileSketchLayerData.mockRejectedValueOnce(new Error('invalid sketch'));
    const mount = mountContext();
    const surface = createProfilePreview(mount.context);
    const render = surface.setup({
      record: { _id: 'profile-2', updatedAt: 2, fields: { sketch: { invalid: true } } },
      payload: null
    });
    await expect(mount.settle()).resolves.toBeUndefined();
    const tree = render();
    expect(tree.children[0].tag).toBe('div');
    expect(tree.children[0].children[0].tag).toBe('i');
  });
});
