import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing } from './listing.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const pluginIds = ['build123d', 'documents', 'facade', 'tech-drawing'];
const listings = pluginIds.map(pluginId => {
  const pluginRoot = resolve(repositoryRoot, 'workers', pluginId);
  const listing = JSON.parse(readFileSync(resolve(pluginRoot, 'listing.json'), 'utf8'));
  return { pluginId, pluginRoot, listing };
});

describe('repository plugin conformance', () => {
  it.each(listings)('$pluginId listing passes the canonical plugin SDK validator', ({ listing }) => {
    expect(() => parseListing(listing)).not.toThrow();
  });

  it.each(listings)('$pluginId serves every declared runtime and surface module', ({ pluginId, pluginRoot, listing }) => {
    for (const runtime of listing.declarations.runtimes || []) {
      expect(
        existsSync(resolve(pluginRoot, runtime.entry.replace(/^\//, ''))),
        `${pluginId} runtime ${runtime.id} entry ${runtime.entry}`
      ).toBe(true);
    }
    for (const surface of listing.declarations.surfaces || []) {
      expect(
        existsSync(resolve(pluginRoot, surface.module.replace(/^\//, ''))),
        `${pluginId} surface ${surface.id} module ${surface.module}`
      ).toBe(true);
    }
  });

  it.each(listings)('$pluginId uses only the current palette metadata shape', ({ pluginId, listing }) => {
    for (const service of listing.declarations.services || []) {
      expect(service.group, `${pluginId} service ${service.id} uses retired group metadata`).toBeUndefined();
      if (service.palette && service.palette.visible !== false) {
        expect(service.palette?.group, `${pluginId} visible service ${service.id} needs palette.group`).toEqual(expect.any(String));
        expect(service.palette.group).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it('covers every installed plugin listing in the repository', () => {
    const discovered = ['build123d', 'documents', 'facade', 'tech-drawing'];
    expect(listings.map(item => item.listing.pluginId).sort()).toEqual(discovered.sort());
  });
});
