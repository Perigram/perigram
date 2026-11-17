import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

describe('Technical drawing plugin node palette contribution', () => {
  it('keeps its ungrouped operation under a stable provider-owned section', () => {
    const services = Object.fromEntries(listing.declarations.services.map(service => [
      service.id,
      { ...service, command: service.id, group: service.group || listing.pluginId, groupLabel: listing.name }
    ]));
    const groups = pluginPaletteGroups({}, services);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 'tech-drawing', label: 'Technical drawing', source: 'plugin' });
    expect(groups[0].items.map(item => item.id)).toEqual(['service:place-dxf']);
  });
});
