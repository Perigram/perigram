import { describe, expect, it } from 'vitest';
import { generatedActionRendersAt, generatedActionSurface } from './action-placement.js';

describe('generated action placement', () => {
  it('assigns one presentation owner by operation concern', () => {
    expect(generatedActionSurface({ actionKind: 'createInstance' })).toBe('collection');
    expect(generatedActionSurface({ actionKind: 'runCommand' })).toBe('entity');
    expect(generatedActionSurface({
      actionKind: 'updateInstance',
      relationMutation: { operation: 'link', key: 'items', targetType: 'item' }
    })).toBe('relation');
    expect(generatedActionRendersAt({ actionKind: 'createInstance' }, ['entity', 'relation'])).toBe(false);
  });
});
