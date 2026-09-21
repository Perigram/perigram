import { describe, expect, it } from 'vitest';
import { normalizeProcessDefinition } from './index.js';

describe('Process Designer context contracts', () => {
  it('infers Current Entity from an unambiguous action or screen context', () => {
    const normalized = normalizeProcessDefinition({
      processNodes: {
        current: { id: 'current', kind: 'read.currentEntity' }
      },
      actions: {
        edit: { id: 'edit', typeId: 'project' }
      },
      screens: {
        detail: { id: 'detail', typeId: 'project' }
      }
    });

    expect(normalized.processNodes.current).toMatchObject({
      typeId: 'project',
      typeIdInferred: true
    });
  });

  it('keeps Current Entity selectable when contexts do not determine one type', () => {
    const normalized = normalizeProcessDefinition({
      processNodes: {
        current: { id: 'current', kind: 'read.currentEntity' }
      },
      actions: {
        edit: { id: 'edit', typeId: 'project' }
      },
      screens: {
        queue: { id: 'queue', typeId: 'queue' }
      }
    });

    expect(normalized.processNodes.current.typeId).toBeUndefined();
    expect(normalized.processNodes.current.typeIdInferred).toBeUndefined();
  });
});
