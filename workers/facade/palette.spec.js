import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

function declaredPaletteGroups() {
  const projections = Object.fromEntries(
    listing.declarations.types.flatMap(type => (type.projections || []).map(projection => [
      `${type.id}:${projection.id}`,
      { ...projection, typeId: type.id, pluginId: listing.pluginId }
    ]))
  );
  const services = Object.fromEntries(
    listing.declarations.services.map(service => [
      service.id,
      {
        ...service,
        command: service.id,
        group: service.group,
        pluginId: listing.pluginId
      }
    ])
  );
  return pluginPaletteGroups(projections, services);
}

describe('Facade plugin node palette contribution', () => {
  it('groups sheet planning, nesting, and production export by workflow', () => {
    const groups = declaredPaletteGroups();
    const nesting = groups.find(group => group.id === 'plugin-facade-nesting');
    const planning = groups.find(group => group.id === 'plugin-facade-sheet-planning');
    const production = groups.find(group => group.id === 'plugin-facade-production-export');
    expect(nesting.items.map(item => item.id)).toContain('service:facade:nesting-solve');
    expect(planning.items.map(item => item.id)).toEqual([
      'service:facade:construct-sheet',
      'service:facade:match-sheet'
    ]);
    expect(production.items.map(item => item.id)).toContain('service:facade:generate-sheet-dxf');
    expect(nesting.items.find(item => item.id === 'service:nesting-solve').searchTerms).toContain('nesting-solve');
    expect(nesting.items.find(item => item.id === 'service:nesting-solve')).toMatchObject({
      label: 'Solve sheet nesting',
      description: 'Arrange cassette-design parts on available sheet stock'
    });
    expect(groups.some(group => group.items.some(item => item.id === 'service:facade:extract-geometry'))).toBe(false);
    expect(groups.some(group => group.items.some(item => item.id === 'service:facade:bake'))).toBe(false);
    expect(groups.some(group => group.items.some(item => item.id === 'service:facade:nesting-parts'))).toBe(false);
  });

  it('keeps every declared projection and service reachable from the plugin palette', () => {
    const groups = declaredPaletteGroups();
    const items = groups.flatMap(group => group.items);
    const projections = new Set(listing.declarations.types.flatMap(type => (type.projections || [])
      .filter(projection => projection.group)
      .map(projection => `${projection.group}:${projection.id}`)));
    expect(items.filter(item => item.kind === 'cts.read')).toHaveLength(projections.size);
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(listing.declarations.services.filter(service => service.group).length);
    expect(items.map(item => item.id)).not.toContain('service:extract-geometry');
    expect(items.map(item => item.id)).not.toContain('service:bake');
    expect(items.map(item => item.id)).not.toContain('service:nesting-parts');
  });
});
