import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedProjectWorkspace.vue', () => ({ default: { name: 'GeneratedProjectWorkspace' } }));
vi.mock('~/components/generated/GeneratedQueueDetail.vue', () => ({ default: { name: 'GeneratedQueueDetail' } }));
vi.mock('~/components/SheetDesignEditor.vue', () => ({ default: { name: 'SheetDesignEditor' } }));

import {
  resolveGeneratedEntityDetailOverload,
  resolveGeneratedScreenOverload
} from './overloads.js';

describe('generated overload registry', () => {
  it('resolves project entity detail screens to the project workspace overload', () => {
    const overload = resolveGeneratedScreenOverload({
      template: 'entityDetail',
      sources: [{ id: 'project', entityType: 'project', mode: 'single' }]
    });

    expect(overload?.entityType).toBe('project');
    expect(overload?.component).toBeTruthy();
  });

  it('does not overload unrelated generated screens', () => {
    expect(resolveGeneratedScreenOverload({
      template: 'entityList',
      entityType: 'project'
    })).toBeNull();
    expect(resolveGeneratedScreenOverload({
      template: 'entityDetail',
      entityType: 'queue'
    })).toBeNull();
    expect(resolveGeneratedScreenOverload(null)).toBeNull();
    expect(resolveGeneratedScreenOverload([])).toBeNull();
  });

  it('keeps entity detail body overloads in the registry', () => {
    expect(resolveGeneratedEntityDetailOverload('queue')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('sheet_design')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('project')).toBeNull();
  });
});
