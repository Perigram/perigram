import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

function declaredPaletteGroups() {
  const projections = Object.fromEntries(
    listing.declarations.types.flatMap(type => (type.projections || []).map(projection => [
      `${type.id}:${projection.id}`,
      { ...projection, typeId: type.id }
    ]))
  );
  const services = Object.fromEntries(
    listing.declarations.services.map(service => [
      service.id,
      {
        ...service,
        command: service.id,
        group: service.group || service.render?.label || service.id
      }
    ])
  );
  return pluginPaletteGroups(projections, services);
}

describe('Facade plugin node palette contribution', () => {
  it('places nesting operations in the declared Facade group', () => {
    const groups = declaredPaletteGroups();
    const facade = groups.find(group => group.id === 'facade');
    expect(facade.items.map(item => item.id)).toContain('extract:nesting-polygons');
    expect(facade.items.map(item => item.id)).toContain('service:nesting-solve');
    expect(facade.items.map(item => item.id)).toContain('service:match-sheet');
  });

  it('keeps every declared projection and service reachable from the plugin palette', () => {
    const groups = declaredPaletteGroups();
    const items = groups.flatMap(group => group.items);
    const projections = new Set(listing.declarations.types.flatMap(type => (type.projections || [])
      .filter(projection => projection.group)
      .map(projection => `${projection.group}:${projection.id}`)));
    expect(items.filter(item => item.kind === 'cts.read')).toHaveLength(projections.size);
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(listing.declarations.services.length);
  });
});
