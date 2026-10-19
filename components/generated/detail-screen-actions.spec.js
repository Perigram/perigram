import { describe, expect, it } from 'vitest';
import {
  generatedDetailActionIds,
  generatedDetailScreenForTypeId,
  recordFloorScreen
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

  it('builds the record floor as a single-source detail screen', () => {
    const floor = recordFloorScreen('text-document');
    expect(floor.template).toBe('instanceDetail');
    expect(floor.typeId).toBe('text-document');
    expect(floor.sources).toEqual([{
      id: 'text-document',
      typeId: 'text-document',
      mode: 'single',
      required: null,
      identifier: '$screen.scope.instanceId'
    }]);
    expect(recordFloorScreen('')).toBeNull();
  });
});
