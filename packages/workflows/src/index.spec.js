import { describe, expect, it } from 'vitest';

import { applyWorkflowTransitionState, createWorkflowState, getPrimaryState, getRegionState, validateTransition } from './index.js';

const workflow = {
  schemaVersion: 2,
  primaryRegion: 'main',
  regions: {
    main: {
      initial: 'DRAFT',
      states: {
        DRAFT: { canUpdateMeta: true },
        REVIEW: {
          canUpdateLifecycle: true,
          lifecycle: {
            actors: ['engineering', 'mounting'],
            attachments: {
              geometry: { multiple: false },
              photos: { multiple: true }
            },
            data: true
          }
        },
        DONE: {}
      },
      transitions: [
        { from: 'DRAFT', to: 'REVIEW', access: { permissions: [{ feature: 'test_entities', level: 'write' }] } },
        { from: 'REVIEW', to: 'DONE', access: { permissions: [{ feature: 'test_entities', level: 'write' }] }, capabilities: ['mounting'] }
      ]
    },
    qa: {
      initial: 'OPEN',
      states: { OPEN: {}, APPROVED: {} },
      transitions: [
        { from: 'OPEN', to: 'APPROVED', access: { permissions: [{ feature: 'test_entities', level: 'write' }] } }
      ]
    }
  }
};

describe('workflow transition validation', () => {
  it('accepts declared transitions without app role policy', () => {
    const result = validateTransition({
      workflow,
      currentState: 'DRAFT',
      targetState: 'REVIEW',
      role: 'VIEWER'
    });

    expect(result.ok).toBe(true);
  });

  it('rejects undeclared lifecycle attachment slots', () => {
    const result = validateTransition({
      workflow,
      currentState: 'DRAFT',
      targetState: 'REVIEW',
      role: 'EDITOR',
      lifecycle: { attachments: { invoice: { fileId: 'file-1' } } }
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lifecycle_attachment_not_allowed');
  });

  it('accepts declared lifecycle actors and attachments', () => {
    const result = validateTransition({
      workflow,
      currentState: 'DRAFT',
      targetState: 'REVIEW',
      role: 'EDITOR',
      lifecycle: {
        actors: [{ userId: 'u2', capability: 'mounting', states: ['DONE'] }],
        attachments: {
          geometry: { fileId: 'geometry-1' },
          photos: [{ fileId: 'photo-1' }]
        },
        data: { measuredWidth: 1200 }
      }
    });

    expect(result.ok).toBe(true);
  });

  it('requires lifecycle attachment slots declared as required', () => {
    const result = validateTransition({
      workflow: {
        ...workflow,
        regions: {
          ...workflow.regions,
          main: {
            ...workflow.regions.main,
            states: {
              ...workflow.regions.main.states,
              REVIEW: {
                lifecycle: {
                  attachments: { proof: { multiple: false, required: true } }
                }
              }
            }
          }
        }
      },
      currentState: 'DRAFT',
      targetState: 'REVIEW',
      role: 'EDITOR',
      lifecycle: { attachments: {} }
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lifecycle_attachment_required');
  });

  it('accepts declared lifecycle snapshots without allowing arbitrary data', () => {
    const snapshotWorkflow = {
      ...workflow,
      regions: {
        ...workflow.regions,
        main: {
          ...workflow.regions.main,
          states: {
            ...workflow.regions.main.states,
            REVIEW: {
              lifecycle: {
                snapshots: { children: { entityType: 'child', required: true } }
              }
            }
          }
        }
      }
    };

    expect(validateTransition({
      workflow: snapshotWorkflow,
      currentState: 'DRAFT',
      targetState: 'REVIEW',
      role: 'EDITOR',
      lifecycle: { data: { snapshots: { children: { count: 1 } } } }
    }).ok).toBe(true);

    const arbitraryData = validateTransition({
      workflow: snapshotWorkflow,
      currentState: 'DRAFT',
      targetState: 'REVIEW',
      role: 'EDITOR',
      lifecycle: { data: { measurements: { width: 10 } } }
    });

    expect(arbitraryData.ok).toBe(false);
    expect(arbitraryData.reason).toBe('lifecycle_data_not_allowed');
  });

  it('requires declared transition capability when present', () => {
    const result = validateTransition({
      workflow,
      currentState: 'REVIEW',
      currentStatus: {
        lifecycle: {
          actors: [{ userId: 'u1', capability: 'engineering', states: ['DONE'] }]
        }
      },
      targetState: 'DONE',
      role: 'EDITOR',
      actorId: 'u1'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('capability_denied');
  });

  it('allows assigned actor with required capability', () => {
    const result = validateTransition({
      workflow,
      currentState: 'REVIEW',
      currentStatus: {
        lifecycle: {
          actors: [{ userId: 'u2', capability: 'mounting', states: ['DONE'] }]
        }
      },
      targetState: 'DONE',
      role: 'EDITOR',
      actorId: 'u2'
    });

    expect(result.ok).toBe(true);
  });

  it('creates structured workflow state for parallel regions', () => {
    const state = createWorkflowState(workflow);
    expect(state.primary).toBe('DRAFT');
    expect(state.active).toEqual({ main: 'DRAFT', qa: 'OPEN' });
    expect(getPrimaryState(state)).toBe('DRAFT');
    expect(getRegionState(state, 'qa')).toBe('OPEN');
  });

  it('applies a scoped transition without changing the primary region', () => {
    const state = createWorkflowState(workflow);
    const next = applyWorkflowTransitionState(state, workflow, { region: 'qa', to: 'APPROVED' }, 'APPROVED');
    expect(next.primary).toBe('DRAFT');
    expect(next.active.qa).toBe('APPROVED');
  });
});
