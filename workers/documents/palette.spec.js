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

describe('Documents plugin node palette contribution', () => {
  it('exposes one plugin section with its declared groups as subgroups', () => {
    const groups = declaredPaletteGroups();
    expect(groups).toHaveLength(1);
    const section = groups[0];
    expect(section).toMatchObject({ id: 'plugin-documents', source: 'plugin' });
    const subgroup = id => section.subgroups.find(group => group.id === id);
    expect(subgroup('table-data').items.map(item => item.id)).toContain('extract:documents:rows');
    expect(subgroup('table-data').items.map(item => item.id)).toContain('extract:documents:cells');
    expect(subgroup('document-composition').items.map(item => item.id)).toContain('service:documents:compose-report');

    expect(subgroup('document-blocks').items.map(item => item.id)).toContain('service:documents:document-paragraph');
    expect(subgroup('document-composition').items.map(item => item.id)).toContain('service:documents:compose-document');
    expect(subgroup('document-export').items.map(item => item.id)).toContain('service:documents:export-markdown-file');
    expect(section.items.find(item => item.id === 'service:documents:compose-report').searchTerms).toContain('compose-report');
  });

  it('keeps every declared projection and grouped service reachable from the palette', () => {
    const groups = declaredPaletteGroups();
    const items = groups.flatMap(group => group.items);
    const projections = new Set(listing.declarations.types.flatMap(type => type.projections || [])
      .filter(projection => projection.palette?.group && projection.palette.visible !== false)
      .map(projection => `${projection.palette.group}:${projection.id}`));
    const services = listing.declarations.services
      .filter(service => service.palette?.group && service.palette.visible !== false);

    expect(items.filter(item => item.kind === 'cts.read')).toHaveLength(projections.size);
    expect(items.filter(item => item.kind === 'cts.service')).toHaveLength(services.length);
    expect(items.map(item => item.id)).not.toEqual(expect.arrayContaining([
      'service:documents:table-rows', 'service:documents:table-cells', 'service:documents:text',
      'service:documents:fill', 'service:documents:render-pdf'
    ]));
  });
});
