import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedHomeWorkspace.vue', () => ({ default: { name: 'GeneratedHomeWorkspace' } }));
vi.mock('~/components/SheetDesignEditor.vue', () => ({ default: { name: 'SheetDesignEditor' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedCassetteDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedCassetteDesignerAction.vue', () => ({ default: { name: 'GeneratedCassetteDesignerAction' } }));
vi.mock('~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadeDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadePatternDesignerWorkspacePage' } }));
vi.mock('~/components/artifacts/SketchEditor.vue', () => ({ default: { name: 'SketchEditor' } }));
vi.mock('~/components/artifacts/ArtifactTextEditor.vue', () => ({ default: { name: 'ArtifactTextEditor' } }));
vi.mock('~/components/entities/Artifact/ArtifactDetail.vue', () => ({ default: { name: 'ArtifactDetail' } }));

import {
  resolveGeneratedInstanceDetailOverload,
  resolveGeneratedScreenOverload
} from './overloads.js';

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

  it('keeps instance detail body overloads in the registry', () => {
    expect(resolveGeneratedInstanceDetailOverload('artifact')?.component).toBeTruthy();
    expect(resolveGeneratedInstanceDetailOverload('cassette')?.component).toBeTruthy();
    expect(resolveGeneratedInstanceDetailOverload('queue')).toBeNull();
    expect(resolveGeneratedInstanceDetailOverload('sheet-design')?.component).toBeTruthy();
    expect(resolveGeneratedInstanceDetailOverload('sketch')?.component).toBeTruthy();
    expect(resolveGeneratedInstanceDetailOverload('text-document')?.component).toBeTruthy();
    expect(resolveGeneratedInstanceDetailOverload('csv-table')?.component).toBeTruthy();
    expect(resolveGeneratedInstanceDetailOverload('project')).toBeNull();
  });

  it('derives file-type overload rows from the pack editor bindings', () => {
    // The projected entity key is the CTS type id; legacy pre-projection
    // keys no longer resolve an editor surface (abandoned data, SPEC §19).
    expect(resolveGeneratedInstanceDetailOverload('sheet_design')).toBeNull();

    const cassette = resolveGeneratedInstanceDetailOverload('cassette');
    expect(cassette.ownsActionSurface).toBe(true);
    const sheetDesign = resolveGeneratedInstanceDetailOverload('sheet-design');
    expect(sheetDesign.ownsActionSurface).toBe(true);
    expect(sheetDesign.props({ entity: { id: 'sd-1' }, canEditSheetDesign: true }))
      .toEqual({ design: { id: 'sd-1' }, editable: true });
  });
});
