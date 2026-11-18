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
      queries: [],
      files: []
    });
  });

  it('records file content hashes as execution dependencies', () => {
    const recorder = createGraphReadSetRecorder();
    recorder.recordFile({
      fileId: 'file-1',
      contentHash: 'sha256:abc',
      organizationId: 'org-1'
    });
    recorder.recordFile({
      fileId: 'file-1',
      contentHash: 'sha256:abc',
      organizationId: 'org-1'
    });

    expect(recorder.toJSON().files).toEqual([{
      fileId: 'file-1',
      contentHash: 'sha256:abc',
      organizationId: 'org-1'
    }]);
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
      resultIds: ['p-2', 'p-1'],
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
        resultIds: ['p-2', 'p-1'],
        observedTotal: 2,
        sequence: 12
      }]
    });
  });

  it('preserves distinct ordered query observations and exact instance revisions', () => {
    const recorder = createGraphReadSetRecorder({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 12,
      organizationSequenceEnd: 12
    });
    const query = { filter: { status: 'ready' }, sort: [{ field: 'createdAt', direction: 'desc' }], limit: 2 };
    recorder.recordQuery({
      typeId: 'part', organizationId: 'org-1', query,
      resultIds: ['p-2', 'p-1'], observedTotal: 2, sequence: 12
    });
    recorder.recordQuery({
      typeId: 'part', organizationId: 'org-1', query,
      resultIds: ['p-1', 'p-2'], observedTotal: 2, sequence: 12
    });
    recorder.recordInstance({ typeId: 'part', instanceId: 'p-1', revision: 'r-1', organizationId: 'org-1' });
    recorder.recordInstance({ typeId: 'part', instanceId: 'p-1', revision: 'r-2', organizationId: 'org-1' });

    const result = recorder.toJSON();
    expect(result.consistency).toBe('unverified');
    expect(result.instances).toHaveLength(2);
    expect(result.queries).toEqual(expect.arrayContaining([
      expect.objectContaining({ resultIds: ['p-2', 'p-1'], sequence: 12 }),
      expect.objectContaining({ resultIds: ['p-1', 'p-2'], sequence: 12 })
    ]));
  });

  it('combines separate database snapshots into one sequence-bracketed graph read set', () => {
    const recorder = createGraphReadSetRecorder({
      consistency: 'snapshot',
      snapshotId: 'snapshot-a',
      organizationSequenceStart: 21,
      organizationSequenceEnd: 21
    });
    recorder.setConsistency({
      consistency: 'snapshot',
      snapshotId: 'snapshot-b',
      organizationSequenceStart: 21,
      organizationSequenceEnd: 21
    });
    expect(recorder.toJSON()).toMatchObject({
      consistency: 'sequence-bracketed',
      snapshotId: null,
      organizationSequenceStart: 21,
      organizationSequenceEnd: 21
    });
  });

  it('does not merge independent snapshots without a shared organization sequence', () => {
    const recorder = createGraphReadSetRecorder({
      consistency: 'snapshot',
      snapshotId: 'snapshot-a'
    });
    recorder.setConsistency({
      consistency: 'snapshot',
      snapshotId: 'snapshot-b'
    });
    expect(recorder.toJSON().consistency).toBe('unverified');
  });

  it('downgrades the shared boundary when graph reads span different sequences', () => {
    const recorder = createGraphReadSetRecorder();
    recorder.setConsistency({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 12,
      organizationSequenceEnd: 12
    });
    recorder.setConsistency({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 13,
      organizationSequenceEnd: 13
    });
    expect(recorder.toJSON()).toMatchObject({
      consistency: 'unverified',
      snapshotId: null,
      organizationSequenceStart: null,
      organizationSequenceEnd: null
    });
  });

  it('does not upgrade an execution after an unverified read', () => {
    const recorder = createGraphReadSetRecorder();
    recorder.setConsistency({ consistency: 'unverified' });
    recorder.setConsistency({
      consistency: 'sequence-bracketed',
      organizationSequenceStart: 13,
      organizationSequenceEnd: 13
    });
    expect(recorder.toJSON().consistency).toBe('unverified');
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
