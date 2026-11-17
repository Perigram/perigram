import { describe, expect, it } from 'vitest';
import { checkSurfaceModule } from '@perigram/plugin-sdk/surface-check';
import listing from './listing.json';
import createCassettePreview from './surfaces/cassette-preview.mjs';
import createProfilePreview from './surfaces/profile-preview.mjs';

const vue = {
  h: (tag, props, children) => ({ tag, props, children }),
  ref: value => ({ value }),
  computed: getter => ({ get value() { return getter(); } }),
  watch: (source, callback, options = {}) => {
    if (options.immediate) callback(source.value);
  }
};
const components = { DrawingCanvas: 'DrawingCanvas', ProgressSpinner: 'ProgressSpinner' };

function tags(tree, result = []) {
  if (!tree || typeof tree !== 'object') return result;
  result.push(tree.tag);
  for (const child of Array.isArray(tree.children) ? tree.children : [tree.children]) tags(child, result);
  return result;
}

describe('Facade preview surfaces', () => {
  it('registers each preview surface as a preview module', () => {
    const previews = listing.declarations.surfaces.filter(surface => surface.kind === 'preview');
    expect(previews.map(surface => surface.id)).toEqual(['cassette-preview', 'profile-preview']);
    expect(previews.every(surface => surface.surfaceContract === 1 && surface.module.startsWith('/surfaces/'))).toBe(true);
  });

  it('passes the surface-module checks', async () => {
    for (const path of ['./surfaces/cassette-preview.mjs', './surfaces/profile-preview.mjs']) {
      await expect(checkSurfaceModule(new URL(path, import.meta.url).pathname, { dependencies: [{ name: 'module' }] })).resolves.toBe(true);
    }
  });

  it('renders a stable empty state for a cassette without resolved geometry', () => {
    const component = createCassettePreview({ vue, components });
    const render = component.setup({ record: { _id: 'cassette-1', fields: {} }, payload: null });
    expect(tags(render())).toContain('i');
  });

  it('renders a stable empty state for a profile without a resolvable sketch', async () => {
    const component = createProfilePreview({ vue, components });
    const render = component.setup({ record: { _id: 'profile-1', fields: { sketch: {} } }, payload: null });
    await Promise.resolve();
    expect(tags(render())).toContain('i');
  });
});
