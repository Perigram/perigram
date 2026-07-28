import { describe, expect, it } from 'vitest';
import { canonicalQueueItem, queueItemTemplateId, resolveQueueItemEntity } from './queue-items.js';

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

  it('resolves explicit legacy cassette-template queue items', () => {
    const cassettes = [{ _id: 'template-1', data: { parameters: ['A'] } }];
    const item = { id: 'template-1', entityType: 'cassette', type: 'PARAMETRIC' };

    expect(resolveQueueItemEntity(item, { cassettes })?._id).toBe('template-1');
    expect(canonicalQueueItem(item, { cassettes })).toMatchObject({
      id: 'template-1',
      entityType: 'cassette'
    });
  });

  it('resolves the source cassette template from design provenance', () => {
    expect(queueItemTemplateId(
      { id: 'design-1', entityType: 'cassette_design' },
      {
        provenance: {
          derivedFrom: {
            source: { type: 'cassette', id: 'template-1' }
          }
        }
      }
    )).toBe('template-1');
    expect(queueItemTemplateId(
      { id: 'design-1', entityType: 'cassette_design' },
      { provenance: { derivedFrom: { source: { type: 'artifact', id: 'file-1' } } } }
    )).toBe('');
  });
});
