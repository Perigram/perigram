import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

// The platform composes plugin services into the palette through
// servicesForOrganization's wireable gate (plugins feature): a service
// whose signature input is a bare value projects no data sockets, so it
// stays off the palette whatever its palette metadata claims. This spec
// models that gate beside the palette projection the designer rides.
function declaredPaletteGroups() {
  const wireable = service => {
    const input = service.signature?.input;
    return !input || input.base === 'record';
  };
  const projections = Object.fromEntries(
    listing.declarations.types.flatMap(type => (type.projections || []).map(projection => [
      `${type.id}:${projection.id}`,
      { ...projection, typeId: type.id, pluginId: listing.pluginId }
    ]))
  );
  const services = Object.fromEntries(
    listing.declarations.services
      .filter(wireable)
      .map(service => [
        service.id,
        {
          ...service,
          command: service.id,
          pluginId: listing.pluginId
        }
      ])
  );
  return pluginPaletteGroups(projections, services);
}

describe('Facade plugin node palette contribution', () => {
  it('exposes one plugin section with the geometry extraction subgroup', () => {
    const groups = declaredPaletteGroups();
    expect(groups).toHaveLength(1);
    const section = groups[0];
    expect(section).toMatchObject({ id: 'plugin-facade', source: 'plugin' });
    const subgroup = id => section.subgroups.find(group => group.id === id);
    expect(subgroup('facade').label).toBe('Facade geometry');
    expect(subgroup('facade').items.map(item => item.id)).toEqual(['extract:facade:nesting-polygons']);
    expect(subgroup('sheet-planning')).toBeUndefined();
    expect(subgroup('production-export')).toBeUndefined();
  });

  it('keeps bare-value executors and declared helpers off the palette', () => {
    const items = declaredPaletteGroups().flatMap(group => group.items);
    const ids = items.map(item => item.id);
    for (const helper of ['extract-geometry', 'bake', 'construct-sheet', 'generate-sheet-dxf', 'nesting-parts']) {
      expect(ids).not.toContain(`service:facade:${helper}`);
    }
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(0);
    expect(items.filter(item => item.kind === 'cts.valueService').map(item => item.id).sort()).toEqual([
      'service:facade:compose-sheet',
      'service:facade:design-bake',
      'service:facade:design-import',
      'service:facade:design-key',
      'service:facade:sheet-dxf'
    ]);
  });

  it('carries operation identity and signature fields as palette search terms', () => {
    const groups = declaredPaletteGroups();
    const extract = groups.flatMap(group => group.items).find(item => item.id === 'extract:facade:nesting-polygons');
    for (const term of ['facade', 'nesting-polygons', 'cassette-design']) {
      expect(extract.searchTerms).toContain(term);
    }
  });
});
