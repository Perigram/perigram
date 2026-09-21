import { describe, expect, it } from 'vitest';
import {
  generatedDetailActionIds,
  generatedDetailScreenForTypeId
} from './detail-screen-actions.js';

const screens = [
  {
    screenKey: 'queue_detail_a',
    route: '/screens/queue_detail_a',
    template: 'instanceDetail',
    sources: [{ id: 'queue', typeId: 'queue', mode: 'single' }],
    regions: [{ id: 'main', sourceId: 'queue', actions: ['solve', 'edit'] }],
    actions: ['fallback']
  },
  {
    screenKey: 'queue_detail_b',
    route: '/screens/queue_detail_b',
    template: 'instanceDetail',
    sources: [{ id: 'queue', typeId: 'queue', mode: 'single' }],
    regions: [{ id: 'main', sourceId: 'queue', actions: ['inspect'] }]
  }
];

describe('generated detail screen actions', () => {
  it('selects the preferred user-scoped detail screen and its main-region actions', () => {
    expect(generatedDetailScreenForTypeId({
      screens,
      typeId: 'queue',
      preferredRoute: '/screens/queue_detail_b'
    })?.screenKey).toBe('queue_detail_b');
    expect(generatedDetailActionIds({
      screens,
      typeId: 'queue',
      preferredRoute: '/screens/queue_detail_b'
    })).toEqual(['inspect']);
  });

  it('does not resolve another entity type or a list screen', () => {
    expect(generatedDetailActionIds({ screens, typeId: 'project' })).toEqual([]);
    expect(generatedDetailScreenForTypeId({
      screens: [{ ...screens[0], template: 'typeList' }],
      typeId: 'queue'
    })).toBeNull();
  });
});
