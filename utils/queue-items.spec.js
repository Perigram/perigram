import { describe, expect, it } from 'vitest';
import { canonicalQueueItem, resolveQueueItemEntity } from './queue-items.js';

describe('queue item helpers', () => {
  it('resolves only direct cassette-design ids', () => {
    const cassetteDesigns = [
      {
        _id: 'design-200x200',
        data: {
          polygonParts: [{}],
          parameters: { A: 200, B: 200, R: 20 }
        }
      },
      {
        _id: 'design-200x400',
        data: {
          polygonParts: [{}],
          parameters: { A: 200, B: 400, R: 20 }
        }
      }
    ];

    const item = {
      id: 'design-200x400',
      entityType: 'cassette_design',
      parameters: { B: 400, R: 20, A: 200 }
    };

    expect(resolveQueueItemEntity({ ...item }, { cassetteDesigns })?._id).toBe('design-200x400');
    expect(canonicalQueueItem({ ...item }, { cassetteDesigns })).toMatchObject({
      id: 'design-200x400',
      entityType: 'cassette_design'
    });
  });

  it('does not reinterpret cassette template ids at runtime', () => {
    const cassettes = [{ _id: 'template-1', data: { parameters: ['A'] } }];

    expect(canonicalQueueItem({ id: 'template-1' }, { cassettes })).toBeNull();
  });
});
