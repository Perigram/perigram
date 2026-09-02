import { resolveCatalogNodePorts } from './node-catalog.js';

const ACTION_EFFECT_KINDS = new Set([
  'effect.createEntity',
  'effect.runProducer',
  'effect.updateEntity',
  'effect.archiveEntity',
  'effect.runCommand',
  'effect.sendEntity',
  'effect.generateAttachment'
]);

export function migrateProducerOutputIdentities(definition = {}, domain = {}) {
  const data = structuredClone(definition.data || definition);
  const producerOutputs = data.producerOutputs ||= {};
  const actions = data.actions ||= {};
  const errors = [];
  let changed = false;

  for (const [recordId, node] of Object.entries(data.processNodes || {})) {
    if (!node?.kind?.startsWith('effect.')) continue;

    const nodeId = String(node.id || recordId);
    const candidates = entityOutputCandidates(nodeId, node, producerOutputs, domain);
    for (const candidate of candidates) {
      const current = producerOutputs[candidate.producerOutputId];
      if (current) continue;
      producerOutputs[candidate.producerOutputId] = {
        producerOutputId: candidate.producerOutputId,
        nodeId,
        outputSocketId: candidate.outputSocketId,
        entityType: candidate.entityType,
        fields: { read: [], write: [], private: [] }
      };
      changed = true;
    }

    const actionId = String(node.entryTriggerId || node.id || recordId);
    const action = actions[actionId];
    const requiresActionIdentity = ACTION_EFFECT_KINDS.has(node.kind)
      && Boolean(node.entityType || action?.entityType);
    const selectedId = node.producerOutputId || action?.producerOutputId || '';

    if (selectedId) {
      const selected = producerOutputs[selectedId];
      if (!selected) {
        errors.push(`Process node ${nodeId} selects missing producer output ${selectedId}`);
        continue;
      }
      const ownsProducedEntity = ['effect.createEntity', 'effect.runProducer'].includes(node.kind);
      if (ownsProducedEntity && String(selected.nodeId) !== nodeId) {
        errors.push(`Process node ${nodeId} selects producer output ${selectedId} owned by node ${selected.nodeId || '(missing)'}`);
        continue;
      }
      if (!node.producerOutputId) {
        node.producerOutputId = selectedId;
        changed = true;
      }
      if (action && !action.producerOutputId) {
        action.producerOutputId = selectedId;
        changed = true;
      }
      continue;
    }

    if (!requiresActionIdentity) continue;
    const entityType = node.entityType || action?.entityType || '';
    const compatible = candidates.filter(candidate => !entityType || candidate.entityType === entityType);
    if (compatible.length !== 1) {
      errors.push(producerIdentityDiagnostic(nodeId, entityType, candidates));
      continue;
    }

    node.producerOutputId = compatible[0].producerOutputId;
    if (action) action.producerOutputId = compatible[0].producerOutputId;
    changed = true;
  }

  for (const [profileId, profile] of Object.entries(data.entityProfiles || {})) {
    const entityType = profile?.entityType || profileId;
    const candidates = Object.values(producerOutputs)
      .filter(output => output?.entityType === entityType)
      .sort((left, right) => left.producerOutputId.localeCompare(right.producerOutputId));
    if (candidates.length !== 1) {
      errors.push(`Entity profile ${profileId} requires one ${entityType} producer output; candidates: ${describeOutputs(candidates)}`);
      continue;
    }
    const output = candidates[0];
    const profileContract = { ...profile };
    delete profileContract.id;
    delete profileContract.entityType;
    producerOutputs[output.producerOutputId] = {
      ...output,
      ...profileContract,
      producerOutputId: output.producerOutputId,
      nodeId: output.nodeId,
      outputSocketId: output.outputSocketId,
      entityType: output.entityType
    };
    delete data.entityProfiles[profileId];
    changed = true;
  }
  if (data.entityProfiles && !Object.keys(data.entityProfiles).length) delete data.entityProfiles;

  if (changed) data.compiled = null;
  return { changed, data, errors };
}

function entityOutputCandidates(nodeId, node, producerOutputs, domain) {
  const candidates = new Map();
  let declaredOutputs = [];
  try {
    declaredOutputs = resolveCatalogNodePorts(node, {
      blockComposition: domain.blockComposition?.[node.block] || null,
      command: domain.commands?.[node.commandId] || null
    }).outputs;
  } catch {
    declaredOutputs = [];
  }
  for (const output of [...declaredOutputs, ...(node.outputs || [])]) {
    const entityType = output?.type?.base === 'entity'
      ? output.type.entityType
      : output?.kind === 'entity' ? output.entityType : '';
    if (!output?.id || !entityType) continue;
    const producerOutputId = `${nodeId}:${output.id}`;
    candidates.set(producerOutputId, {
      producerOutputId,
      outputSocketId: String(output.id),
      entityType: String(entityType)
    });
  }
  for (const [producerOutputId, output] of Object.entries(producerOutputs || {})) {
    if (String(output?.nodeId) !== nodeId || !output?.outputSocketId || !output?.entityType) continue;
    candidates.set(producerOutputId, {
      producerOutputId,
      outputSocketId: String(output.outputSocketId),
      entityType: String(output.entityType)
    });
  }
  return [...candidates.values()].sort((left, right) => left.producerOutputId.localeCompare(right.producerOutputId));
}

function producerIdentityDiagnostic(nodeId, entityType, candidates) {
  const described = describeOutputs(candidates);
  return `Process node ${nodeId} requires one ${entityType || 'entity'} producer output; candidates: ${described}`;
}

function describeOutputs(candidates) {
  return candidates.length
    ? candidates.map(candidate => `${candidate.producerOutputId} (${candidate.entityType})`).join(', ')
    : 'none';
}
