import { describe, expect, it } from 'vitest';
import { canonicalQueueItem, resolveQueueItemEntity } from './queue-items.js';

describe('queue item helpers', () => {
  it('canonicalizes legacy baked cassette source ids to cassette design ids by parameters', () => {
    const cassetteDesigns = [
      {
        _id: 'design-200x200',
        lineage: { cassette: { entityType: 'cassette', entityId: 'type-2-o3rCZZ' } },
        data: {
          polygonParts: [{}],
          parameters: { A: 200, B: 200, R: 20 }
        }
      },
      {
        _id: 'design-200x400',
        lineage: { cassette: { entityType: 'cassette', entityId: 'type-2-o3rCZZ' } },
        data: {
          polygonParts: [{}],
          parameters: { A: 200, B: 400, R: 20 }
        }
      }
    ];

    const item = {
      id: 'type-2-o3rCZZ',
      entityType: 'cassette',
      parameters: { B: 400, R: 20, A: 200 }
    };

    expect(resolveQueueItemEntity({ ...item }, { cassetteDesigns })?._id).toBe('design-200x400');
    expect(canonicalQueueItem({ ...item }, { cassetteDesigns })).toMatchObject({
      id: 'design-200x400',
      cassetteTemplateId: 'design-200x400',
      entityType: 'cassette_design'
    });
  });

  it('keeps direct cassette ids canonical', () => {
    const cassettes = [{ _id: 'template-1', data: { parameters: ['A'] } }];

    expect(canonicalQueueItem({ id: 'template-1' }, { cassettes })).toMatchObject({
      id: 'template-1',
      entityType: 'cassette'
    });
  });
});
