import { describe, expect, it } from 'vitest';
import { hasMeaningfulWorkflowStatus, workflowStateCount } from './status-actions.js';

const workflows = {
  recorded: {
    primaryRegion: 'main',
    regions: {
      main: { initial: 'RECORDED', states: { RECORDED: {} }, transitions: [] }
    }
  },
  production: {
    primaryRegion: 'main',
    regions: {
      main: {
        initial: 'DRAFT',
        states: { DRAFT: {}, READY: {} },
        transitions: [{ from: 'DRAFT', to: 'READY' }]
      }
    }
  }
};

describe('status visibility', () => {
  it('hides lifecycle status only when the effective workflow has one state', () => {
    expect(workflowStateCount('recorded', workflows)).toBe(1);
    expect(hasMeaningfulWorkflowStatus('recorded', workflows)).toBe(false);
    expect(hasMeaningfulWorkflowStatus('production', workflows)).toBe(true);
    expect(hasMeaningfulWorkflowStatus('unknown', workflows)).toBe(true);
  });

  it('matches canonical snake-case workflow keys from camel-case UI types', () => {
    expect(hasMeaningfulWorkflowStatus('entityRevision', {
      entity_revision: workflows.recorded
    })).toBe(false);
  });
});
