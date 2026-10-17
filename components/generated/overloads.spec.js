import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/GeneratedHomeWorkspace.vue', () => ({ default: { name: 'GeneratedHomeWorkspace' } }));
vi.mock('~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadeDesignerWorkspacePage' } }));
vi.mock('~/components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue', () => ({ default: { name: 'GeneratedFacadePatternDesignerWorkspacePage' } }));
vi.mock('~/packages/tech-drawing/src/editors/SketchEditor.vue', () => ({ default: { name: 'SketchEditor' } }));
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

  it('keeps the artifact detail overload as the only instance body overload', () => {
    expect(resolveGeneratedInstanceDetailOverload('artifact')?.component).toBeTruthy();
    // Editors are workspace pages, never detail overloads.
    for (const typeId of ['cassette', 'sheet-design', 'sketch', 'text-document', 'csv-table', 'xlsx-workbook', 'queue', 'project']) {
      expect(resolveGeneratedInstanceDetailOverload(typeId)).toBeNull();
    }
  });

  it('does not resolve legacy pre-projection type keys', () => {
    expect(resolveGeneratedInstanceDetailOverload('sheet_design')).toBeNull();
  });
});
