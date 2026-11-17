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
        group: service.group
      }
    ])
  );
  return pluginPaletteGroups(projections, services);
}

describe('Facade plugin node palette contribution', () => {
  it('places nesting operations in the declared Facade group', () => {
    const groups = declaredPaletteGroups();
    const nesting = groups.find(group => group.id === 'nesting');
    const planning = groups.find(group => group.id === 'sheet-planning');
    const production = groups.find(group => group.id === 'production-export');
    expect(nesting.items.map(item => item.id)).toContain('service:nesting-solve');
    expect(planning.items.map(item => item.id)).toEqual([
      'service:match-sheet',
      'service:construct-sheet'
    ]);
    expect(production.items.map(item => item.id)).toContain('service:generate-sheet-dxf');
    expect(nesting.items.find(item => item.id === 'service:nesting-solve').searchTerms).toContain('nesting-solve');
    expect(groups.some(group => group.items.some(item => item.id === 'service:extract-geometry'))).toBe(false);
    expect(groups.some(group => group.items.some(item => item.id === 'service:bake'))).toBe(false);
    expect(groups.some(group => group.items.some(item => item.id === 'service:nesting-parts'))).toBe(false);
  });

  it('keeps every declared projection and service reachable from the plugin palette', () => {
    const groups = declaredPaletteGroups();
    const items = groups.flatMap(group => group.items);
    const projections = new Set(listing.declarations.types.flatMap(type => (type.projections || [])
      .filter(projection => projection.group)
      .map(projection => `${projection.group}:${projection.id}`)));
    expect(items.filter(item => item.kind === 'cts.read')).toHaveLength(projections.size);
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(listing.declarations.services.filter(service => service.group).length);
  });
});
