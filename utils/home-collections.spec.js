import { describe, expect, it } from 'vitest';
import { homeCollectionSections } from './home-collections.js';

const t = key => ({ 'collections.workpieces': 'Workpieces' }[key] || key);
const te = key => key === 'collections.workpieces';

describe('homeCollectionSections', () => {
  it('returns the home screen list sources as collections', () => {
    const home = {
      regions: [
        { id: 'r1', sourceId: 's1', labelKey: 'collections.workpieces' },
        { id: 'r2', sourceId: 's2' },
        { id: 'r3', sourceId: 's3' },
        { id: 'r4', sourceId: 's4' }
      ],
      sources: [
        { id: 's1', typeId: 'workpiece', mode: 'list' },
        { id: 's2', typeId: 'sheet', mode: 'single' },
        {
          id: 's3',
          typeId: 'queue',
          mode: 'list',
          lineageBindings: [{ childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId' }]
        },
        { id: 's4', mode: 'list' }
      ]
    };
    const sections = homeCollectionSections(home, { t, te });
    expect(sections.map(section => section.region.id)).toEqual(['r1']);
    expect(sections[0].label).toBe('Workpieces');
    expect(sections[0].source.typeId).toBe('workpiece');
  });

  it('returns no collections without a home screen', () => {
    expect(homeCollectionSections(null, { t, te })).toEqual([]);
  });
});
