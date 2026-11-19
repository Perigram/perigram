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
  it('exposes the wireable sheet-planning operation and the geometry extraction', () => {
    const groups = declaredPaletteGroups();
    const planning = groups.find(group => group.id === 'plugin-facade-sheet-planning');
    expect(planning.label).toBe('Sheet planning');
    expect(planning.items.map(item => item.id)).toEqual(['service:facade:match-sheet']);
    const geometry = groups.find(group => group.id === 'plugin-facade-facade');
    expect(geometry.label).toBe('Facade geometry');
    expect(geometry.items.map(item => item.id)).toEqual(['extract:facade:nesting-polygons']);
  });

  it('keeps bare-value executors and declared helpers off the palette', () => {
    const items = declaredPaletteGroups().flatMap(group => group.items);
    const ids = items.map(item => item.id);
    for (const helper of ['extract-geometry', 'bake', 'construct-sheet', 'generate-sheet-dxf', 'nesting-parts']) {
      expect(ids).not.toContain(`service:facade:${helper}`);
    }
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(1);
  });

  it('carries operation identity and signature fields as palette search terms', () => {
    const groups = declaredPaletteGroups();
    const match = groups.flatMap(group => group.items).find(item => item.id === 'service:facade:match-sheet');
    for (const term of ['facade', 'match-sheet', 'layoutKey', 'sheets']) {
      expect(match.searchTerms).toContain(term);
    }
    const extract = groups.flatMap(group => group.items).find(item => item.id === 'extract:facade:nesting-polygons');
    for (const term of ['facade', 'nesting-polygons', 'cassette-design']) {
      expect(extract.searchTerms).toContain(term);
    }
  });
});
