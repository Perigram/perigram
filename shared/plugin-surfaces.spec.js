import { describe, expect, it } from 'vitest';
import { endpointOriginOf, pluginModuleUrl, SUPPORTED_SURFACE_CONTRACTS, isSupportedSurfaceContract } from './plugin-surfaces.js';

describe('plugin surface origins and supported contracts', () => {
  it('supports contract majors through the lifecycle mount (owner decision 2026-10-28)', () => {
    // Major 4 added the sheet-design editor's open.instance channel;
    // major 5 added the construct and remove lifecycle transports.
    expect(SUPPORTED_SURFACE_CONTRACTS).toEqual([1, 2, 3, 4, 5]);
    expect(isSupportedSurfaceContract(3)).toBe(true);
    expect(isSupportedSurfaceContract(4)).toBe(true);
    expect(isSupportedSurfaceContract(5)).toBe(true);
    expect(isSupportedSurfaceContract(6)).toBe(false);
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
