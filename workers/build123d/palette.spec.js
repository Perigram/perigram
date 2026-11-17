import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

describe('build123d plugin node palette contribution', () => {
  it('keeps every graph-composable operation in its declared semantic group', () => {
    const services = Object.fromEntries(listing.declarations.services.map(service => [
      service.id,
      { ...service, command: service.id, pluginId: listing.pluginId }
    ]));
    const groups = pluginPaletteGroups({}, services);
    const items = groups.flatMap(group => group.items);
    expect(groups.map(group => group.id).sort()).toEqual([
      'plugin-build123d-algebra',
      'plugin-build123d-curve',
      'plugin-build123d-drafting',
      'plugin-build123d-operations',
      'plugin-build123d-part',
      'plugin-build123d-sketch',
      'plugin-build123d-text'
    ]);
    const declaredIds = listing.declarations.services.map(service => `service:build123d:${service.id}`).sort();
    expect(items.map(item => item.id).sort()).toEqual(declaredIds);
    expect(new Set(items.map(item => item.id)).size).toBe(declaredIds.length);
    expect(items.every(item => item.kind === 'cts.service')).toBe(true);
    expect(items.map(item => item.id)).not.toEqual(expect.arrayContaining([
      'service:build123d:basepartobject', 'service:build123d:basesketchobject', 'service:build123d:basecurveobject',
      'service:build123d:baselineobject', 'service:build123d:baseedgeobject', 'service:build123d:line',
      'service:build123d:polyline', 'service:build123d:polygon', 'service:build123d:bezier', 'service:build123d:spline',
      'service:build123d:threepointarc', 'service:build123d:constrainedarcs', 'service:build123d:constrainedlines'
    ]));
    expect(items.find(item => item.id === 'service:build123d:box')).toMatchObject({
      label: 'Box',
      description: expect.stringContaining('Create a box'),
      searchTerms: expect.arrayContaining(['length', 'width', 'height'])
    });
  });
});
