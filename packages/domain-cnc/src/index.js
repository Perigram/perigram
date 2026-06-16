export { cncEntities } from './entities.js';
export { cncWorkflows } from './workflows.js';
export { cncEvents } from './events.js';
export { cncEffects } from './effects.js';
export { cncServiceContracts, cncCommands } from './commands.js';
export { cncTasks } from './tasks.js';
export { cncHookContracts } from './hooks.js';
export { cncSummaries, cncFrontendEntities } from './summaries.js';
export { cncAttachmentKinds } from './attachment-kinds.js';
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
  cncDesignSystem,
  cncUiSurfaces
} from './ui.js';

import { cncEntities } from './entities.js';
import { cncWorkflows } from './workflows.js';
import { cncEvents } from './events.js';
import { cncEffects } from './effects.js';
import { cncServiceContracts, cncCommands } from './commands.js';
import { cncTasks } from './tasks.js';
import { cncHookContracts } from './hooks.js';
import { cncFrontendEntities, cncSummaries } from './summaries.js';
import { cncAttachmentKinds } from './attachment-kinds.js';
import { cncEntityFieldAccess } from './field-access.js';
import { cncDesignSystem, cncStatusUi, cncUiSurfaces } from './ui.js';

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
  attachmentKinds: cncAttachmentKinds,
  fieldAccess: cncEntityFieldAccess,
  designSystem: cncDesignSystem,
  uiSurfaces: cncUiSurfaces,
  ui: {
    endpoints: cncFrontendEntities,
    surfaces: cncUiSurfaces,
    status: cncStatusUi,
    designSystem: cncDesignSystem
  }
};
