import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedHomeWorkspace.vue', () => ({ default: { name: 'GeneratedHomeWorkspace' } }));
vi.mock('~/components/generated/GeneratedProjectWorkspace.vue', () => ({ default: { name: 'GeneratedProjectWorkspace' } }));
vi.mock('~/components/generated/GeneratedQueueDetail.vue', () => ({ default: { name: 'GeneratedQueueDetail' } }));
vi.mock('~/components/SheetDesignEditor.vue', () => ({ default: { name: 'SheetDesignEditor' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedCassetteDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadeDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadePatternDesignerWorkspacePage' } }));
vi.mock('~/components/entities/Artifact/ArtifactDetail.vue', () => ({ default: { name: 'ArtifactDetail' } }));

import {
  resolveGeneratedEntityDetailOverload,
  resolveGeneratedScreenOverload
} from './overloads.js';

describe('generated overload registry', () => {
  it('resolves home screens to the home workspace overload', () => {
    const overload = resolveGeneratedScreenOverload({
      template: 'home',
      regions: []
    });

    expect(overload?.entityType).toBeUndefined();
    expect(overload?.component).toBeTruthy();
  });

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
    expect(resolveGeneratedEntityDetailOverload('artifact')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('cassette')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('facade')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('facade_pattern')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('queue')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('sheet_design')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('project')).toBeNull();
  });
});
