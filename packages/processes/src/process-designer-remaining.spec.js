import { describe, expect, it } from 'vitest';
import { normalizeProcessDefinition } from './index.js';

describe('Process Designer context contracts', () => {
  it('infers Current Entity from an unambiguous action or screen context', () => {
    const normalized = normalizeProcessDefinition({
      processNodes: {
        current: { id: 'current', kind: 'read.currentEntity' }
      },
      actions: {
        edit: { id: 'edit', entityType: 'project' }
      },
      screens: {
        detail: { id: 'detail', entityType: 'project' }
      }
    });

    expect(normalized.processNodes.current).toMatchObject({
      entityType: 'project',
      entityTypeInferred: true
    });
  });

  it('keeps Current Entity selectable when contexts do not determine one type', () => {
    const normalized = normalizeProcessDefinition({
      processNodes: {
        current: { id: 'current', kind: 'read.currentEntity' }
      },
      actions: {
        edit: { id: 'edit', entityType: 'project' }
      },
      screens: {
        queue: { id: 'queue', entityType: 'queue' }
      }
    });

    expect(normalized.processNodes.current.entityType).toBeUndefined();
    expect(normalized.processNodes.current.entityTypeInferred).toBeUndefined();
  });
});
