import { describe, expect, it } from 'vitest';
import {
  processStatusMetadata,
  processTransitionContext,
  actionStatusDisplayMetadata
} from './status-metadata.js';

describe('process status metadata', () => {
  it('projects authored state display fields without leaking unrelated state data', () => {
    expect(processStatusMetadata({
      id: 'approve',
      producerOutputId: 'approved',
      state: { to: 'APPROVED' }
    }, 'Approved by reviewer', {
      stateDefinitions: {
        approved: { stateId: 'APPROVED', label: 'Approved', color: 'green', icon: 'check' }
      }
    })).toEqual({
      note: 'Approved by reviewer',
      producerOutputId: 'approved',
      display: { label: 'Approved', color: 'green', severity: 'green', icon: 'check' }
    });
  });

  it('preserves existing transition context while attaching display metadata', () => {
    expect(processTransitionContext({
      state: { to: 'DONE' }
    }, {
      stateMeta: { metadata: { source: 'review' }, actor: 'user-1' }
    }, {
      stateDefinitions: {
        done: { stateId: 'DONE', severity: 'success' }
      }
    })).toEqual({
      metadata: {
        source: 'review',
        display: { color: 'success', severity: 'success' }
      },
      actor: 'user-1'
    });
  });

  it('returns the original context when no display metadata is declared', () => {
    const context = { note: 'No display override' };
    expect(processTransitionContext({ state: { to: 'UNKNOWN' } }, { context }, {})).toBe(context);
  });

  it('resolves referenced state definitions before inline action display fields', () => {
    expect(actionStatusDisplayMetadata({
      stateRef: 'done',
      state: { label: 'Finished' }
    }, {
      stateDefinitions: {
        done: { label: 'Complete', color: 'blue', icon: 'flag' }
      }
    })).toEqual({
      label: 'Finished',
      color: 'blue',
      severity: 'blue',
      icon: 'flag'
    });
  });
});
