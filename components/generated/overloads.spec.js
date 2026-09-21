import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedHomeWorkspace.vue', () => ({ default: { name: 'GeneratedHomeWorkspace' } }));
vi.mock('~/components/generated/GeneratedProjectWorkspace.vue', () => ({ default: { name: 'GeneratedProjectWorkspace' } }));
vi.mock('~/components/SheetDesignEditor.vue', () => ({ default: { name: 'SheetDesignEditor' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedCassetteDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerAction.vue', () => ({ default: { name: 'GeneratedCassetteDesignerAction' } }));
vi.mock('~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadeDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadePatternDesignerWorkspacePage' } }));
vi.mock('~/components/artifacts/SketchEditor.vue', () => ({ default: { name: 'SketchEditor' } }));
vi.mock('~/components/artifacts/ArtifactTextEditor.vue', () => ({ default: { name: 'ArtifactTextEditor' } }));
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
      template: 'instanceDetail',
      sources: [{ id: 'project', typeId: 'project', mode: 'single' }]
    });

    expect(overload?.typeId).toBe('project');
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
    expect(resolveGeneratedEntityDetailOverload('facade-design')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('facade-pattern')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('queue')).toBeNull();
    expect(resolveGeneratedEntityDetailOverload('sheet-design')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('sketch')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('text-document')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('csv-table')?.component).toBeTruthy();
    expect(resolveGeneratedEntityDetailOverload('project')).toBeNull();
  });

  it('derives file-type overload rows from the pack editor bindings', () => {
    // The projected entity key is the CTS type id; legacy pre-projection
    // keys no longer resolve an editor surface (abandoned data, SPEC §19).
    expect(resolveGeneratedEntityDetailOverload('sheet_design')).toBeNull();
    expect(resolveGeneratedEntityDetailOverload('facade')).toBeNull();
    expect(resolveGeneratedEntityDetailOverload('facade_pattern')).toBeNull();

    const cassette = resolveGeneratedEntityDetailOverload('cassette');
    expect(cassette.ownsActionSurface).toBe(true);
    const sheetDesign = resolveGeneratedEntityDetailOverload('sheet-design');
    expect(sheetDesign.ownsActionSurface).toBe(true);
    expect(sheetDesign.props({ entity: { id: 'sd-1' }, canEditSheetDesign: true }))
      .toEqual({ design: { id: 'sd-1' }, editable: true });
  });
});
