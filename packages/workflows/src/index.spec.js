import { describe, expect, it } from 'vitest';

import { applyWorkflowTransitionState, createWorkflowState, getPrimaryState, getRegionState, normalizeWorkflow, resolveWorkflowStatePath, validateTransition } from './index.js';

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
                snapshots: { children: { typeId: 'child', required: true } }
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

const nestedWorkflow = {
  schemaVersion: 2,
  primaryRegion: 'main',
  regions: {
    main: {
      initial: 'PRODUCTION',
      states: {
        PRODUCTION: {
          initial: 'queued',
          states: {
            queued: {},
            cutting: {}
          }
        },
        // Deliberately collides with the nested local name `cutting`.
        cutting: {},
        FAILED: { isTerminal: true }
      },
      transitions: [
        { from: 'PRODUCTION.cutting', to: 'FAILED' },
        { from: 'PRODUCTION', to: 'cutting' }
      ]
    },
    qa: {
      initial: 'OPEN',
      states: { OPEN: {}, APPROVED: { isTerminal: true } },
      transitions: [{ from: 'OPEN', to: 'APPROVED' }]
    }
  }
};

describe('recursive workflow state trees', () => {
  it('normalizes to exact full paths without local child aliases or collisions', () => {
    const region = normalizeWorkflow(nestedWorkflow).regions.main;
    expect(region.initial).toBe('PRODUCTION');
    expect(region.states['PRODUCTION']).toMatchObject({ path: ['PRODUCTION'] });
    expect(region.states['PRODUCTION.cutting']).toMatchObject({ path: ['PRODUCTION', 'cutting'] });
    expect(region.states.cutting).toMatchObject({ path: ['cutting'] });
    expect(region.states.queued).toBeUndefined();
    expect(region.states.cutting.path).toEqual(['cutting']);
  });

  it('enters a targeted parent as a leaf instead of auto-descending', () => {
    const state = createWorkflowState(nestedWorkflow);
    expect(state.primary).toBe('PRODUCTION');
    expect(state.regions.main.path).toEqual(['PRODUCTION']);

    const moved = applyWorkflowTransitionState(
      state,
      nestedWorkflow,
      { region: 'main', from: 'PRODUCTION', to: 'PRODUCTION' },
      'PRODUCTION'
    );
    expect(moved.primary).toBe('PRODUCTION');
    expect(moved.active.qa).toBe('OPEN');
  });

  it('selects the most-specific active ancestor transition', () => {
    const result = validateTransition({
      workflow: nestedWorkflow,
      currentState: 'PRODUCTION.cutting',
      targetState: 'FAILED',
      region: 'main',
      role: 'EDITOR'
    });
    expect(result).toMatchObject({ ok: true, from: 'PRODUCTION.cutting', to: 'FAILED' });

    const shadowed = validateTransition({
      workflow: nestedWorkflow,
      currentState: 'PRODUCTION.cutting',
      targetState: 'cutting',
      region: 'main',
      role: 'EDITOR'
    });
    expect(shadowed).toMatchObject({ ok: false, reason: 'invalid_transition' });
  });

  it('preserves every untouched axis while moving one nested leaf', () => {
    const state = createWorkflowState(nestedWorkflow, { active: { qa: 'APPROVED' } });
    const next = applyWorkflowTransitionState(
      state,
      nestedWorkflow,
      { region: 'main', from: 'PRODUCTION', to: 'PRODUCTION.cutting' },
      'PRODUCTION.cutting'
    );
    expect(next.active).toEqual({ main: 'PRODUCTION.cutting', qa: 'APPROVED' });
    expect(next.primary).toBe('PRODUCTION.cutting');
  });
});

describe('recursive workflow state trees', () => {
  it('normalizes to exact full paths without local child aliases or collisions', () => {
    const region = normalizeWorkflow(nestedWorkflow).regions.main;
    expect(region.initial).toBe('PRODUCTION');
    expect(region.states['PRODUCTION']).toMatchObject({ path: ['PRODUCTION'] });
    expect(region.states['PRODUCTION.cutting']).toMatchObject({ path: ['PRODUCTION', 'cutting'] });
    expect(region.states.cutting).toMatchObject({ path: ['cutting'] });
    expect(region.states.queued).toBeUndefined();
    expect(region.states.cutting.path).toEqual(['cutting']);
  });

  it('enters a targeted parent as a leaf instead of auto-descending', () => {
    const state = createWorkflowState(nestedWorkflow);
    expect(state.primary).toBe('PRODUCTION');
    expect(state.regions.main.path).toEqual(['PRODUCTION']);

    const moved = applyWorkflowTransitionState(
      state,
      nestedWorkflow,
      { region: 'main', from: 'PRODUCTION', to: 'PRODUCTION' },
      'PRODUCTION'
    );
    expect(moved.primary).toBe('PRODUCTION');
    expect(moved.active.qa).toBe('OPEN');
  });

  it('selects the most-specific active ancestor transition', () => {
    const result = validateTransition({
      workflow: nestedWorkflow,
      currentState: 'PRODUCTION.cutting',
      targetState: 'FAILED',
      region: 'main',
      role: 'EDITOR'
    });
    expect(result).toMatchObject({ ok: true, from: 'PRODUCTION.cutting', to: 'FAILED' });

    const shadowed = validateTransition({
      workflow: nestedWorkflow,
      currentState: 'PRODUCTION.cutting',
      targetState: 'cutting',
      region: 'main',
      role: 'EDITOR'
    });
    expect(shadowed).toMatchObject({ ok: false, reason: 'invalid_transition' });
  });

  it('preserves every untouched axis while moving one nested leaf', () => {
    const state = createWorkflowState(nestedWorkflow, { active: { qa: 'APPROVED' } });
    const next = applyWorkflowTransitionState(
      state,
      nestedWorkflow,
      { region: 'main', from: 'PRODUCTION', to: 'PRODUCTION.cutting' },
      'PRODUCTION.cutting'
    );
    expect(next.active).toEqual({ main: 'PRODUCTION.cutting', qa: 'APPROVED' });
    expect(next.primary).toBe('PRODUCTION.cutting');
  });
});

it('resolves a parent name to its region entry after a normalize round trip', () => {
  const compiled = JSON.parse(JSON.stringify(normalizeWorkflow(nestedWorkflow)));
  const region = normalizeWorkflow(compiled).regions.main;
  expect(resolveWorkflowStatePath(region, 'PRODUCTION')).toBe('PRODUCTION');
  expect(resolveWorkflowStatePath(region, 'queued')).toBe('PRODUCTION.queued');
  expect(resolveWorkflowStatePath(region, 'mystery')).toBeNull();
});
