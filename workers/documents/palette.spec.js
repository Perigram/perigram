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

describe('Documents plugin node palette contribution', () => {
  it('exposes declared table extraction and document operations as plugin-owned groups', () => {
    const groups = declaredPaletteGroups();
    const tableData = groups.find(group => group.id === 'table-data');
    const documentCompose = groups.find(group => group.id === 'document-compose');

    expect(groups.every(group => group.source === 'plugin')).toBe(true);
    expect(tableData.items.map(item => item.id)).toContain('extract:rows');
    expect(tableData.items.map(item => item.id)).toContain('extract:cells');
    expect(documentCompose.items.map(item => item.id)).toContain('service:compose-report');
    expect(documentCompose.items.find(item => item.id === 'service:compose-report').searchTerms).toContain('compose-report');
  });

  it('keeps every declared projection and grouped service reachable from the palette', () => {
    const groups = declaredPaletteGroups();
    const items = groups.flatMap(group => group.items);
    const projections = new Set(listing.declarations.types.flatMap(type => type.projections || [])
      .filter(projection => projection.group)
      .map(projection => `${projection.group}:${projection.id}`));
    const services = listing.declarations.services
      .filter(service => service.group || service.render?.label || service.id);

    expect(items.filter(item => item.kind === 'cts.read')).toHaveLength(projections.size);
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(services.length);
  });
});
