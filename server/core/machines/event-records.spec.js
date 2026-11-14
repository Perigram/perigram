import { describe, expect, it } from 'vitest';
import {
  buildEventActor,
  buildEventEvidence,
  buildStatusEventRecord
} from './event-records.js';

describe('workflow status event records', () => {
  it('serializes the ledger envelope and omits an absent source', () => {
    const eventId = 'event-1';
    const timestampBefore = Date.now();
    const record = buildStatusEventRecord({
      eventId,
      targetId: 'entity-1',
      targetType: 'project',
      fromState: 'DRAFT',
      toState: 'ACTIVE',
      fromStatePrimary: 'DRAFT',
      toStatePrimary: 'ACTIVE',
      region: 'main',
      statusData: { state: { primary: 'ACTIVE' } },
      actor: { id: 'user-1' },
      operation: { kind: 'transition' },
      evidence: { description: null }
    });

    expect(record).toMatchObject({
      _id: eventId,
      targetId: 'entity-1',
      targetType: 'project',
      fromState: 'DRAFT',
      toState: 'ACTIVE',
      operation: { kind: 'transition' }
    });
    expect(record).not.toHaveProperty('source');
    expect(record.timestamp).toBeInstanceOf(Date);
    expect(record.timestamp.getTime()).toBeGreaterThanOrEqual(timestampBefore);
  });

  it('classifies system, service, and user principals consistently', () => {
    expect(buildEventActor({}, 'SYSTEM')).toMatchObject({ id: 'SYSTEM', principalType: 'SYSTEM' });
    expect(buildEventActor({ name: 'Worker' }, 'service_worker')).toMatchObject({
      id: 'service_worker',
      label: 'Worker',
      principalType: 'service'
    });
    expect(buildEventActor({}, 'user-1')).toMatchObject({ id: 'user-1', principalType: 'user' });
  });

  it('normalizes lifecycle evidence and prefers note over description', () => {
    const evidence = buildEventEvidence({ note: 'Transition note', description: 'Fallback' }, {});
    expect(evidence.description).toBe('Transition note');
    expect(evidence.attachments).toEqual({});
    expect(evidence.lifecycle).toBeDefined();
  });
});
