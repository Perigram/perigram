export { cncEntities } from './entities.js';
export { cncWorkflows } from './workflows.js';
export { cncEvents } from './events.js';
export { cncEffects } from './effects.js';
export { cncServiceContracts, cncCommands } from './commands.js';
export { cncTasks } from './tasks.js';
export { cncHookContracts } from './hooks.js';
export { cncSummaries, cncFrontendEntities } from './summaries.js';
export { cncContainment, cncRelations } from './relationships.js';
export { cncEntityRevisions } from './revisions.js';
export { cncEntityProducers } from './producers.js';
export { cncAttachmentKinds } from './attachment-kinds.js';
export { cncEntityCreateInputs, getEntityCreateInputs } from './entity-create-inputs.js';
export { cncEntityConstruction, getEntityConstruction } from './entity-construction.js';
export {
  cncEntityFieldAccess,
  getEntityFieldAccessPolicy,
  normalizeFieldAccessEntityType
} from './field-access.js';
export {
  cncStatusUi,
  cncDesignSystemVariants,
  cncDesignSystemGroups,
  cncDesignSystemPrimitives,
  cncDesignSystemEntityContracts,
  cncEntitySurfaceContracts,
  cncDesignSystem,
  cncUiSurfaces
} from './ui.js';
export { cncEntityFieldGroups, getEntityFieldGroups } from './ui-fields.js';
export {
  cncBlockComposition,
  cncBlockFieldSchemas,
  cncEntityFieldSchemas,
  getBlockFieldSchema,
  getBlockFieldSchemas,
  getEntityFieldSchema,
  getEntityFieldSchemas
} from './field-schemas.js';
export {
  CNC_SURFACES,
  CNC_PREVIEW_MODES,
  CNC_DATA_DISPLAYS,
  CNC_RELATION_DISPLAYS,
  CNC_ACTION_DISPLAYS,
  createEntitySurfaceContracts,
  getEntitySurfaceContract
} from './ui-surfaces.js';

import { cncEntities } from './entities.js';
import { cncWorkflows } from './workflows.js';
import { cncEvents } from './events.js';
import { cncEffects } from './effects.js';
import { cncServiceContracts, cncCommands } from './commands.js';
import { cncTasks } from './tasks.js';
import { cncHookContracts } from './hooks.js';
import { cncFrontendEntities, cncSummaries } from './summaries.js';
import { cncContainment, cncRelations } from './relationships.js';
import { cncEntityRevisions } from './revisions.js';
import { cncEntityProducers } from './producers.js';
import { cncAttachmentKinds } from './attachment-kinds.js';
import { cncEntityCreateInputs } from './entity-create-inputs.js';
import { cncEntityConstruction } from './entity-construction.js';
import { cncEntityFieldAccess } from './field-access.js';
import { cncDesignSystem, cncStatusUi, cncUiSurfaces, cncEntitySurfaceContracts } from './ui.js';
import { cncEntityFieldGroups } from './ui-fields.js';
import { cncBlockComposition, cncBlockFieldSchemas, cncEntityFieldSchemas } from './field-schemas.js';

export const cncDomain = {
  id: 'cnc',
  label: 'CNC fabrication',
  entities: cncEntities,
  workflows: cncWorkflows,
  events: cncEvents,
  effects: cncEffects,
  serviceContracts: cncServiceContracts,
  commands: cncCommands,
  tasks: cncTasks,
  hooks: cncHookContracts,
  summaries: cncSummaries,
  containment: cncContainment,
  relations: cncRelations,
  revisions: cncEntityRevisions,
  producers: cncEntityProducers,
  attachmentKinds: cncAttachmentKinds,
  createInputs: cncEntityCreateInputs,
  construction: cncEntityConstruction,
  fieldAccess: cncEntityFieldAccess,
  designSystem: cncDesignSystem,
  fieldGroups: cncEntityFieldGroups,
  blockComposition: cncBlockComposition,
  blockSchemas: cncBlockFieldSchemas,
  fieldSchemas: cncEntityFieldSchemas,
  surfaceContracts: cncEntitySurfaceContracts,
  uiSurfaces: cncUiSurfaces,
  ui: {
    endpoints: cncFrontendEntities,
    surfaces: cncUiSurfaces,
    status: cncStatusUi,
    designSystem: cncDesignSystem
  }
};
