import GeneratedProjectWorkspace from '~/components/generated/GeneratedProjectWorkspace.vue';
import GeneratedQueueDetail from '~/components/generated/GeneratedQueueDetail.vue';
import SheetDesignEditor from '~/components/SheetDesignEditor.vue';

export const generatedScreenOverloads = [
  {
    template: 'entityDetail',
    entityType: 'project',
    component: GeneratedProjectWorkspace
  }
];

export const generatedEntityDetailOverloads = [
  {
    entityType: 'queue',
    component: GeneratedQueueDetail,
    props: ({ entity, screenKey, queueDetailActions }) => ({
      queue: entity,
      screenKey,
      processActions: queueDetailActions
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
  return generatedScreenOverloads.find(overload => (
    overload.template === screen.template
    && overload.entityType === detailEntityType(screen)
  )) || null;
}

export function resolveGeneratedEntityDetailOverload(entityType = '') {
  return generatedEntityDetailOverloads.find(overload => overload.entityType === entityType) || null;
}

function detailEntityType(screen = {}) {
  if (screen.entityType) return screen.entityType;
  const singleSource = (screen.sources || []).find(source => source.mode === 'single');
  return singleSource?.entityType || '';
}
