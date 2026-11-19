import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing } from './listing.js';
import { endpointServices as facadeEndpointServices } from '../../../workers/facade/services.js';
import { services as techDrawingEndpointServices } from '../../../workers/tech-drawing/services.js';
import build123dCatalog from '../../../workers/build123d/catalog.json' with { type: 'json' };
import build123dListing from '../../../workers/build123d/listing.json' with { type: 'json' };
import documentsListing from '../../../workers/documents/listing.json' with { type: 'json' };
import facadeListing from '../../../workers/facade/listing.json' with { type: 'json' };
import techDrawingListing from '../../../workers/tech-drawing/listing.json' with { type: 'json' };
import nestingListing from '../../../workers/nesting/listing.json' with { type: 'json' };
import { buildDocumentsRuntime } from '../../../workers/documents/build-runtime.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const listings = [
  { pluginId: 'build123d', pluginRoot: resolve(repositoryRoot, 'workers/build123d'), listing: build123dListing },
  { pluginId: 'documents', pluginRoot: resolve(repositoryRoot, 'workers/documents'), listing: documentsListing },
  { pluginId: 'facade', pluginRoot: resolve(repositoryRoot, 'workers/facade'), listing: facadeListing },
  { pluginId: 'nesting', pluginRoot: resolve(repositoryRoot, 'workers/nesting'), listing: nestingListing },
  { pluginId: 'tech-drawing', pluginRoot: resolve(repositoryRoot, 'workers/tech-drawing'), listing: techDrawingListing }
];

describe('repository plugin conformance', () => {
  beforeAll(async () => {
    await buildDocumentsRuntime();
  });
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

  it.each(listings)('$pluginId service targets are backed by their declared runtime', ({ listing }) => {
    const runtimes = new Map((listing.declarations.runtimes || []).map(runtime => [runtime.id, runtime]));
    for (const service of listing.declarations.services || []) {
      if (!service.execution?.runtime) {
        expect(service.mode, `${service.id} must declare an endpoint mode or runtime`).toBe('endpoint');
        continue;
      }
      const runtime = runtimes.get(service.execution.runtime);
      expect(runtime, `${service.id} references a declared runtime`).toBeDefined();
      for (const target of service.execution.targets || []) {
        expect(runtime.targets, `${service.id} target ${target} is supported by ${runtime.id}`).toContain(target);
      }
    }
  });

  it.each(listings)('$pluginId endpoint services resolve to real implementations', ({ pluginId, pluginRoot, listing }) => {
    const declared = (listing.declarations.services || [])
      .filter(service => service.mode === 'endpoint')
      .map(service => service.id)
      .sort();
    const implementations = {
      facade: facadeEndpointServices,
      'tech-drawing': techDrawingEndpointServices
    };
    if (pluginId === 'build123d') {
      expect(build123dCatalog.ops.map(operation => operation.id).sort()).toEqual(declared);
      expect(existsSync(resolve(pluginRoot, 'dispatch.py'))).toBe(true);
      return;
    }
    const services = implementations[pluginId] || {};
    expect(Object.keys(services).sort()).toEqual(declared);
    for (const id of declared) expect(typeof services[id], `${pluginId}.${id}`).toBe('function');
  });

  it('documents ships every declared dependency module under its plugin root', () => {
    const pluginRoot = resolve(repositoryRoot, 'workers/documents');
    for (const dependency of documentsListing.declarations.dependencies || []) {
      if (String(dependency.module).startsWith('plugin:')) continue;
      expect(existsSync(resolve(pluginRoot, `.${dependency.module}`)), `${dependency.name} at ${dependency.module}`).toBe(true);
    }
  });

  it('covers every installed plugin listing in the repository', () => {
    const discovered = ['build123d', 'documents', 'facade', 'nesting', 'tech-drawing'];
    expect(listings.map(item => item.listing.pluginId).sort()).toEqual(discovered.sort());
  });
});
