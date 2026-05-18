import { cncWorkflows } from '~/packages/domain-cnc/src/index.js';

/**
 * Compatibility export for legacy imports. CNC workflow definitions now live
 * in the domain package and are consumed by the runtime status engine.
 */
export const stateMachines = cncWorkflows;
