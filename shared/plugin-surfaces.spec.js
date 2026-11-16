import { describe, expect, it } from 'vitest';
import { endpointOriginOf, pluginModuleUrl, SUPPORTED_SURFACE_CONTRACTS, isSupportedSurfaceContract } from './plugin-surfaces.js';

describe('plugin surface origins and supported contracts', () => {
  it('supports contract majors through the capability mount (owner decision 2026-10-17)', () => {
    // Major 4 added the sheet-design editor's open.instance channel.
    expect(SUPPORTED_SURFACE_CONTRACTS).toEqual([1, 2, 3, 4]);
    expect(isSupportedSurfaceContract(3)).toBe(true);
    expect(isSupportedSurfaceContract(4)).toBe(true);
    expect(isSupportedSurfaceContract(5)).toBe(false);
  });

  it('serves organization-owned package modules through the same-origin proxy', () => {
    expect(pluginModuleUrl({ pluginId: 'demo', packageAssets: { count: 2 } }, '/runtime.mjs'))
      .toBe('/api/plugins/demo/module/runtime.mjs');
    expect(pluginModuleUrl({ pluginId: 'demo', declarations: { runtimes: [{ id: 'js' }] } }, '/runtime.mjs'))
      .toBe('/api/plugins/demo/module/runtime.mjs');
  });

  it('derives the module origin from service endpoints first, then the surface origin', () => {
    expect(endpointOriginOf({ endpoints: { match: 'http://a:1/x' } })).toBe('http://a:1');
    expect(endpointOriginOf({ endpoints: {}, surfaceOrigin: 'http://b:2' })).toBe('http://b:2');
    expect(endpointOriginOf({ endpoints: {}, surfaceOrigin: 'not-a-url' })).toBeNull();
    expect(endpointOriginOf({})).toBeNull();
    expect(pluginModuleUrl({ pluginId: 'x', surfaceOrigin: 'http://b:2' }, '/surfaces/s.mjs'))
      .toBe('/api/plugins/x/module/surfaces/s.mjs');
  });
});
