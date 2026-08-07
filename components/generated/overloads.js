import GeneratedProjectWorkspace from '~/components/generated/GeneratedProjectWorkspace.vue';
import GeneratedQueueDetail from '~/components/generated/GeneratedQueueDetail.vue';
import SheetDesignEditor from '~/components/SheetDesignEditor.vue';
import GeneratedCassetteDesignerWorkspacePage from '~/components/generated/GeneratedCassetteDesignerWorkspacePage.vue';
import GeneratedFacadeDesignerWorkspacePage from '~/components/generated/GeneratedFacadeDesignerWorkspacePage.vue';
import GeneratedFacadePatternDesignerWorkspacePage from '~/components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue';
import ArtifactDetail from '~/components/entities/Artifact/ArtifactDetail.vue';

export const generatedScreenOverloads = [
  {
    template: 'entityDetail',
    entityType: 'project',
    component: GeneratedProjectWorkspace
  }
];

export const generatedEntityDetailOverloads = [
  {
    entityType: 'artifact',
    component: ArtifactDetail,
    props: ({ entity }) => ({ artifact: entity })
  },
  {
    entityType: 'cassette',
    component: GeneratedCassetteDesignerWorkspacePage,
    props: ({ entity }) => ({ cassette: entity })
  },
  {
    entityType: 'facade',
    component: GeneratedFacadeDesignerWorkspacePage,
    props: ({ entity }) => ({ facade: entity })
  },
  {
    entityType: 'facade_pattern',
    component: GeneratedFacadePatternDesignerWorkspacePage,
    props: ({ entity }) => ({ facadePattern: entity })
  },
  {
    entityType: 'queue',
    component: GeneratedQueueDetail,
    props: ({ entity, screenKey, queueDetailActions, mode }) => ({
      queue: entity,
      screenKey,
      processActions: queueDetailActions,
      flush: mode === 'file'
    })
  },
  {
    entityType: 'sheet_design',
    component: SheetDesignEditor,
    props: ({ entity, canEditSheetDesign }) => ({
      design: entity,
      editable: canEditSheetDesign
    })
  }
];

export function resolveGeneratedScreenOverload(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return null;
  return generatedScreenOverloads.find(overload => (
    overload.template === screen.template
    && overload.entityType === detailEntityType(screen)
  )) || null;
}

export function resolveGeneratedEntityDetailOverload(entityType = '') {
  return generatedEntityDetailOverloads.find(overload => overload.entityType === entityType) || null;
}

function detailEntityType(screen = {}) {
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return '';
  if (screen.entityType) return screen.entityType;
  const singleSource = (screen.sources || []).find(source => source.mode === 'single');
  return singleSource?.entityType || '';
}
