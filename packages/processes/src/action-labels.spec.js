import { describe, expect, it } from 'vitest';
import { actionTargetState, displayActionLabel } from './action-labels.js';

describe('compiled action labels', () => {
  it('resolves the target state from the compiled state reference', () => {
    expect(actionTargetState({
      stateRef: 'state-review',
      state: { to: 'legacy' }
    }, {
      stateDefinitions: {
        'state-review': { stateId: 'review' }
      }
    })).toBe('review');
  });

  it('derives a readable update caption from its type', () => {
    expect(displayActionLabel({
      actionKind: 'updateEntity',
      typeId: 'panel'
    }, 'update-panel', {}, {
      entities: [{ type: 'panel', label: 'Panel' }]
    })).toBe('Update Panel');
  });

  it('preserves a meaningful authored caption', () => {
    expect(displayActionLabel({
      actionKind: 'updateEntity',
      typeId: 'panel',
      label: 'Approve panel'
    }, 'update-panel')).toBe('Approve panel');
  });
});
