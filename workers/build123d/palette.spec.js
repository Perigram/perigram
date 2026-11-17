import { describe, expect, it } from 'vitest';
import listing from './listing.json';
import { pluginPaletteGroups } from '#packages/processes';

describe('build123d plugin node palette contribution', () => {
  it('keeps every discovered operation in its declared semantic group', () => {
    const services = Object.fromEntries(listing.declarations.services.map(service => [
      service.id,
      { ...service, command: service.id, group: service.group }
    ]));
    const groups = pluginPaletteGroups({}, services);
    const items = groups.flatMap(group => group.items);
    expect(groups.map(group => group.id).sort()).toEqual([
      'build123d-algebra',
      'build123d-curve',
      'build123d-drafting',
      'build123d-operations',
      'build123d-part',
      'build123d-sketch',
      'build123d-text'
    ]);
    expect(items).toHaveLength(64);
    expect(new Set(items.map(item => item.id)).size).toBe(64);
    expect(items.every(item => item.kind === 'cts.service')).toBe(true);
  });
});
