import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { servicesPaletteGroups } from '#packages/processes';

describe('Technical drawing plugin node palette contribution', () => {
  it('keeps its ungrouped operation under a stable provider-owned section', () => {
    const services = Object.fromEntries(listing.declarations.services.map(service => [
      service.id,
      { ...service, command: `plugin.${listing.pluginId}.${service.id}`, pluginId: listing.pluginId }
    ]));
    const groups = servicesPaletteGroups(services);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 'plugin-tech-drawing-operations', label: 'Operations', source: 'plugin' });
    expect(groups[0].items.map(item => item.id)).toEqual(['service:tech-drawing:place-dxf']);
  });
});
