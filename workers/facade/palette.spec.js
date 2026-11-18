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
        pluginId: listing.pluginId
      }
    ])
  );
  return pluginPaletteGroups(projections, services);
}

describe('Facade plugin node palette contribution', () => {
  it('groups sheet planning and production export by workflow', () => {
    const groups = declaredPaletteGroups();
    const planning = groups.find(group => group.id === 'plugin-facade-sheet-planning');
    const production = groups.find(group => group.id === 'plugin-facade-production-export');
    expect(planning.items.map(item => item.id)).toEqual([
      'service:facade:construct-sheet',
      'service:facade:match-sheet'
    ]);
    expect(production.items.map(item => item.id)).toContain('service:facade:generate-sheet-dxf');
    expect(groups.some(group => group.id === 'plugin-facade-nesting')).toBe(false);
    expect(groups.some(group => group.items.some(item => item.id === 'service:facade:extract-geometry'))).toBe(false);
    expect(groups.some(group => group.items.some(item => item.id === 'service:facade:bake'))).toBe(false);
    expect(groups.some(group => group.items.some(item => item.id === 'service:facade:nesting-parts'))).toBe(false);
  });

  it('keeps every declared projection and service reachable from the plugin palette', () => {
    const groups = declaredPaletteGroups();
    const items = groups.flatMap(group => group.items);
    const projections = new Set(listing.declarations.types.flatMap(type => (type.projections || [])
      .filter(projection => projection.palette?.group && projection.palette.visible !== false)
      .map(projection => `${projection.palette.group}:${projection.id}`)));
    expect(items.filter(item => item.kind === 'cts.read')).toHaveLength(projections.size);
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(listing.declarations.services.filter(service => service.palette?.group && service.palette.visible !== false).length);
    expect(items.map(item => item.id)).not.toContain('service:facade:extract-geometry');
    expect(items.map(item => item.id)).not.toContain('service:facade:bake');
    expect(items.map(item => item.id)).not.toContain('service:facade:nesting-parts');
  });
});
