import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

describe('Technical drawing plugin node palette contribution', () => {
  it('exposes one plugin section: declared groups as subgroups, its ungrouped operation on the root', () => {
    const services = Object.fromEntries(listing.declarations.services.map(service => [
      service.id,
      { ...service, command: `plugin.${listing.pluginId}.${service.id}`, pluginId: listing.pluginId }
    ]));
    const groups = pluginPaletteGroups({}, services);
    expect(groups).toHaveLength(1);
    const section = groups[0];
    expect(section).toMatchObject({ id: 'plugin-tech-drawing', source: 'plugin' });
    expect(section.subgroups).toBeUndefined();
    expect(section.items.map(item => item.id)).toEqual(['service:tech-drawing:place-dxf']);
  });
});
