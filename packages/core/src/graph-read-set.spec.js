import { describe, expect, it } from 'vitest';
import { createGraphReadSetRecorder, emptyGraphReadSet } from './graph-read-set.js';

describe('graph execution read set', () => {
  it('starts with an explicitly unverified consistency boundary', () => {
    expect(emptyGraphReadSet()).toEqual({
      consistency: 'unverified',
      snapshotId: null,
      organizationSequenceStart: null,
      organizationSequenceEnd: null,
      instances: [],
      relations: [],
      queries: []
    });
  });

  it('deduplicates exact instance, relation, and query dependencies deterministically', () => {
    const recorder = createGraphReadSetRecorder({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 12,
      organizationSequenceEnd: 12
    });
    recorder.recordInstance({ typeId: 'part', instanceId: 'p-1', revision: 'r-3', organizationId: 'org-1' });
    recorder.recordInstance({ typeId: 'part', instanceId: 'p-1', revision: 'r-3', organizationId: 'org-1' });
    recorder.recordRelation({ sourceTypeId: 'part', sourceId: 'p-1', key: 'material', targetTypeId: 'material', targetId: 'm-1' });
    recorder.recordQuery({
      typeId: 'part',
      organizationId: 'org-1',
      query: { filter: { status: 'ready' }, sort: [{ field: 'createdAt', direction: 'desc' }], limit: 20 },
      resultIds: ['p-2', 'p-1', 'p-2'],
      observedTotal: 2,
      sequence: 12
    });
    recorder.recordQuery({
      typeId: 'part',
      organizationId: 'org-1',
      query: { filter: { status: 'ready' }, sort: [{ field: 'createdAt', direction: 'desc' }], limit: 20 },
      resultIds: ['p-1', 'p-2'],
      observedTotal: 2,
      sequence: 12
    });

    expect(recorder.toJSON()).toMatchObject({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 12,
      organizationSequenceEnd: 12,
      instances: [{ typeId: 'part', instanceId: 'p-1', revision: 'r-3' }],
      relations: [{ sourceTypeId: 'part', sourceId: 'p-1', key: 'material', targetTypeId: 'material', targetId: 'm-1' }],
      queries: [{
        typeId: 'part',
        organizationId: 'org-1',
        resultIds: ['p-1', 'p-2'],
        observedTotal: 2,
        sequence: 12
      }]
    });
  });

  it('requires complete identities for instance and relation dependencies', () => {
    const recorder = createGraphReadSetRecorder();
    expect(() => recorder.recordInstance({ typeId: 'part' })).toThrow(/instance id/);
    expect(() => recorder.recordRelation({ sourceTypeId: 'part', sourceId: 'p-1', key: 'material' })).toThrow(/targetTypeId/);
    expect(() => recorder.recordQuery({ query: {} })).toThrow(/query typeId/);
  });

  it('updates the declared consistency boundary without claiming a database snapshot by default', () => {
    const recorder = createGraphReadSetRecorder();
    recorder.setConsistency({ consistency: 'snapshot', snapshotId: 'snapshot-1', organizationSequenceStart: 20 });
    expect(recorder.toJSON()).toMatchObject({
      consistency: 'snapshot',
      snapshotId: 'snapshot-1',
      organizationSequenceStart: 20,
      organizationSequenceEnd: null
    });
  });
});
