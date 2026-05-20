import { describe, expect, it } from 'vitest';

import { validateTransition } from './index.js';

const workflow = {
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
});
