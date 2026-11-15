import {
  PROCESS_SCHEMA_VERSION,
  normalizeRoleCatalog,
  compileLineageBindings,
  compileWorkflows,
  compileRoles,
  compileScreens,
  compileFieldPolicies,
  compileActions,
  workflowDropsNoOp,
  compileStatusDefinitions,
  compileValueInputs,
  compileProcessNodes,
  compileServices,
  compileSockets
} from './compiler-core.js';
import { validateProcessDefinition } from './validation.js';
import { projectUiContractChannels } from './ui-contract-projection.js';

export function compileProcessDefinition(definition = {}, domain = {}, { roles = {} } = {}) {
  const organizationRoles = normalizeRoleCatalog(roles);
  const validation = validateProcessDefinition(definition, domain, { roles: organizationRoles });
  if (!validation.ok) {
    const error = new Error(validation.errors.join('; '));
    error.validation = validation;
    throw error;
  }

  const process = validation.definition;
  const lineageBindings = compileLineageBindings(process, domain);
  const workflows = compileWorkflows(process, domain, lineageBindings);
  const workflowByType = {};
  for (const [producerOutputId, workflow] of Object.entries(workflows)) {
    const typeId = process.producerOutputs?.[producerOutputId]?.typeId;
    if (typeId && !workflowByType[typeId]) workflowByType[typeId] = workflow;
  }
  const compiledRoles = compileRoles(process, domain, organizationRoles, lineageBindings, workflows);
  const compiledScreens = compileScreens(process, domain, compiledRoles, lineageBindings);
  const fieldPolicies = compileFieldPolicies(process.producerOutputs, domain);
  // The compiled machine is the authority on the execution channel too: a
  // status-mutating action whose edge the machine dropped is not part of
  // the contract, so no surface renders it and the run API resolves none.
  const compiledActions = Object.fromEntries(Object.entries(compileActions(process.actions, process, domain, lineageBindings))
    .filter(([, action]) => action.actionKind !== 'updateEntity'
      || !action.state?.to
      || !workflowDropsNoOp(workflowByType[action.typeId], action.state.from, action.state.to)));
  const producerOutputs = Object.fromEntries(Object.entries(process.producerOutputs).map(([producerOutputId, output]) => [producerOutputId, {
    ...output,
    producerOutputId,
    workflow: workflows[producerOutputId],
    fieldPolicy: fieldPolicies[producerOutputId],
    actions: Object.values(compiledActions).filter(action => action.producerOutputId === producerOutputId),
    lineageBindings: lineageBindings.filter(binding => binding.producerOutputId === producerOutputId)
  }]));

  return {
    schemaVersion: PROCESS_SCHEMA_VERSION,
    activatedAt: new Date().toISOString(),
    roles: compiledRoles,
    servicePrincipals: process.servicePrincipals,
    producerOutputs,
    actions: compiledActions,
    stateDefinitions: compileStatusDefinitions(process.stateDefinitions),
    valueInputs: compileValueInputs(process.valueInputs),
    processNodes: compileProcessNodes(process.processNodes),
    services: compileServices(process.services),
    sockets: compileSockets(process.sockets),
    screens: projectUiContractChannels({ screens: compiledScreens }).screens,
    lineageBindings,
    warnings: validation.warnings
  };
}

