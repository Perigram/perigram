import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

describe('build123d plugin node palette contribution', () => {
  it('keeps every graph-composable operation in its declared semantic group inside one plugin section', () => {
    const services = Object.fromEntries(listing.declarations.services.map(service => [
      service.id,
      { ...service, command: service.id, pluginId: listing.pluginId }
    ]));
    const groups = pluginPaletteGroups({}, services);
    expect(groups).toHaveLength(1);
    const section = groups[0];
    expect(section).toMatchObject({ id: 'plugin-build123d', source: 'plugin' });
    expect(section.subgroups.map(subgroup => subgroup.id).sort()).toEqual([
      'algebra', 'curve', 'drafting', 'face', 'modify', 'part', 'sketch', 'solid', 'text'
    ]);
    const declaredIds = listing.declarations.services.map(service => `service:build123d:${service.id}`).sort();
    expect(section.items.map(item => item.id).sort()).toEqual(declaredIds);
    expect(new Set(section.items.map(item => item.id)).size).toBe(declaredIds.length);
    expect(section.items.every(item => item.kind === 'cts.service')).toBe(true);
    expect(section.items.map(item => item.id)).not.toEqual(expect.arrayContaining([
      'service:build123d:basepartobject', 'service:build123d:basesketchobject', 'service:build123d:basecurveobject',
      'service:build123d:baselineobject', 'service:build123d:baseedgeobject', 'service:build123d:line',
      'service:build123d:polyline', 'service:build123d:polygon', 'service:build123d:bezier', 'service:build123d:spline',
      'service:build123d:threepointarc', 'service:build123d:constrainedarcs', 'service:build123d:constrainedlines'
    ]));
    expect(section.items.find(item => item.id === 'service:build123d:box')).toMatchObject({
      label: 'Box',
      description: expect.stringContaining('Create a box'),
      searchTerms: expect.arrayContaining(['length', 'width', 'height'])
    });
    expect(section.subgroups.find(subgroup => subgroup.id === 'modify').items.map(item => item.id)).toContain('service:build123d:chamfer');
    expect(section.subgroups.find(subgroup => subgroup.id === 'solid').items.map(item => item.id)).toContain('service:build123d:extrude');
    expect(section.subgroups.find(subgroup => subgroup.id === 'face').items.map(item => item.id)).toContain('service:build123d:make-face');
  });
});
