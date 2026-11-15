import { creationModeLabel } from './ui-contract-projection.js';
import { entityLabelOf } from './type-labels.js';

export function actionTargetState(action = {}, process = {}) {
  const stateRef = action.stateRef;
  const referenced = stateRef ? process.stateDefinitions?.[stateRef] : null;
  return referenced?.stateId
    || action.state?.to
    || action.access?.stateTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

export function displayActionLabel(action = {}, id = '', process = {}, domain = {}) {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action.actionKind)) return explicit;

  const typeId = action.typeId
    || action.inputs?.find(input => input.typeId)?.typeId
    || action.outputs?.find(output => output.typeId)?.typeId
    || '';
  if ((action.actionKind || 'createEntity') === 'createEntity') {
    // The create caption names the target class plus a distinguishing
    // construction mode; the initial state is process machinery the surface
    // reveals after creation, never button copy.
    const modeLabel = creationModeLabel(action.construction?.mode);
    return ['Create', typeIdLabel(domain, typeId), modeLabel && `from ${modeLabel}`]
      .filter(Boolean).join(' ');
  }
  if (action.actionKind === 'updateEntity') {
    if (actionTargetState(action, process)) return stateTargetLabel(action, process) || ['Move', typeIdLabel(domain, typeId), action.state?.to].filter(Boolean).join(' ');
    return ['Update', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'deleteEntity') {
    return ['Delete', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'runCommand') {
    return ['Run', serviceRenderLabel(domain, action.commandId) || action.commandId].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'sendToOrganization') {
    return ['Send', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  return action.actionKind || id;
}

function stateTargetLabel(action = {}, process = {}) {
  const referenced = action.stateRef ? process.stateDefinitions?.[action.stateRef] : null;
  return referenced?.label
    || referenced?.stateId
    || action.state?.label
    || action.state?.to
    || action.access?.stateTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

// A plugin service's declared render label — the authored caption source
// for its run action (a raw command id never reaches a button).
function serviceRenderLabel(domain = {}, commandId = '') {
  return domain.serviceContracts?.[commandId]?.render?.label || '';
}

function isGenericActionLabel(label, actionKind = '') {
  const normalized = label.trim().toLowerCase();
  // Raw node-kind strings the designer saves as default labels are
  // machinery vocabulary, not captions — every species spelling (v5
  // included: a caption that is just the record's kind derives from the
  // action kind below.
  const generic = new Set([
    'create', 'status', 'service', 'update', 'send', 'action',
    'cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove',
    'cts.read', 'cts.field', 'cts.command', 'cts.service', 'cts.conversion',
    actionKind?.toLowerCase?.()
  ].filter(Boolean));
  return generic.has(normalized);
}

function typeIdLabel(domain = {}, typeId = '') {
  if (!typeId) return '';
  return entityLabelOf(domain, typeId) || typeId.replace(/_/g, ' ');
}
