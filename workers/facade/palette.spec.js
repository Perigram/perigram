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
  it('exposes one plugin section with sheet planning and production export subgroups', () => {
    const groups = declaredPaletteGroups();
    expect(groups).toHaveLength(1);
    const section = groups[0];
    expect(section).toMatchObject({ id: 'plugin-facade', source: 'plugin' });
    const subgroup = id => section.subgroups.find(group => group.id === id);
    expect(subgroup('sheet-planning').items.map(item => item.id)).toEqual([
      'service:facade:construct-sheet',
      'service:facade:match-sheet'
    ]);
    expect(subgroup('production-export').items.map(item => item.id)).toContain('service:facade:generate-sheet-dxf');
    expect(subgroup('nesting')).toBeUndefined();
    expect(section.items.map(item => item.id)).not.toContain('service:facade:extract-geometry');
    expect(section.items.map(item => item.id)).not.toContain('service:facade:bake');
    expect(section.items.map(item => item.id)).not.toContain('service:facade:nesting-parts');
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
