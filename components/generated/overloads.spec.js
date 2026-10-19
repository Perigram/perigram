import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedHomeWorkspace.vue', () => ({ default: { name: 'GeneratedHomeWorkspace' } }));

import { resolveGeneratedScreenOverload } from './overloads.js';

describe('generated overload registry', () => {
  it('resolves home screens to the home workspace overload', () => {
    const overload = resolveGeneratedScreenOverload({
      template: 'home',
      regions: []
    });

    expect(overload?.typeId).toBeUndefined();
    expect(overload?.component).toBeTruthy();
  });

  it('does not overload instanceDetail screens for undeclared types', () => {
    const overload = resolveGeneratedScreenOverload({
      template: 'instanceDetail',
      sources: [{ id: 'project', typeId: 'project', mode: 'single' }]
    });

    expect(overload).toBeNull();
  });

  it('does not overload unrelated generated screens', () => {
    expect(resolveGeneratedScreenOverload({
      template: 'typeList',
      typeId: 'project'
    })).toBeNull();
    expect(resolveGeneratedScreenOverload({
      template: 'instanceDetail',
      typeId: 'queue'
    })).toBeNull();
    expect(resolveGeneratedScreenOverload(null)).toBeNull();
    expect(resolveGeneratedScreenOverload([])).toBeNull();
  });
});
