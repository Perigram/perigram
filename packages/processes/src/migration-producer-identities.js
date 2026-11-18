import { resolveCatalogNodePorts } from './node-catalog.js';
import { CONSUMER_SPECIES_KINDS, PRODUCER_ORIGIN_SPECIES_KINDS } from './node-catalog.js';
import { operationKindOf } from '@perigram/cts';

// The v4 input vocabulary of this one-shot migration: it reads persisted
// pre-species records, so the retired spellings are local data here beside
// the species sets. Classification reads the record's own kind.
const V4_CONSUMER_EFFECT_KINDS = [
  'effect.updateEntity',
  'effect.changeStatus',
  'effect.archiveEntity',
  'effect.deleteEntity',
  'effect.sendEntity',
  'effect.generateAttachment'
];
const V4_ACTION_EFFECT_KINDS = [
  'effect.createEntity',
  'effect.runProducer',
  'effect.updateEntity',
  'effect.archiveEntity',
  'effect.runCommand',
  'effect.sendEntity',
  'effect.generateAttachment'
];
const CONSUMER_KINDS = [...V4_CONSUMER_EFFECT_KINDS, ...CONSUMER_SPECIES_KINDS];
const ACTION_EFFECT_KINDS = new Set([...V4_ACTION_EFFECT_KINDS, ...PRODUCER_ORIGIN_SPECIES_KINDS]);

function actionHasStaleOwnBinding(actions = {}, nodeId = '') {
  return Object.values(actions || {}).some(action => (
    String(action?.producerOutputId || '').startsWith(`${nodeId}:`)
  ));
}

export function migrateProducerOutputIdentities(definition = {}, domain = {}) {
  const data = structuredClone(definition.data || definition);
  const producerOutputs = data.producerOutputs ||= {};
  const actions = data.actions ||= {};
  const errors = [];
  let changed = false;

  for (const [recordId, node] of Object.entries(data.processNodes || {})) {
    if (!node?.kind?.startsWith('effect.') && !String(node?.kind || '').startsWith('cts.')) continue;

    const nodeId = String(node.id || recordId);
    // Designer-bypassed (API-authored) species records get the same
    // identity rewrite live designer sync applies, so both authoring
    // paths persist bindings.
    const opKind = operationKindOf(node) || node.kind;
    // Only effects participate in producer identity: joins, reads, and
    // value-algebra records never mint producer outputs (the join routes
    // under its selected source by contract).
    if (!ACTION_EFFECT_KINDS.has(opKind) && !CONSUMER_KINDS.includes(opKind)) continue;
    // Consumer effects own no producer output: drop records minted by
    // pre-protocol definitions and their node identity; the derived action
    // rebinds to the upstream producer of the entity input wire.
    if (CONSUMER_KINDS.includes(opKind)) {
      for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
        if (String(output?.nodeId) === nodeId) {
          delete producerOutputs[producerOutputId];
          changed = true;
        }
      }
      if (String(node.producerOutputId || '').startsWith(`${nodeId}:`)) {
        delete node.producerOutputId;
        changed = true;
      }
      if (actionHasStaleOwnBinding(actions, nodeId)) {
        for (const action of Object.values(actions)) {
          if (String(action?.producerOutputId || '').startsWith(`${nodeId}:`)) {
            delete action.producerOutputId;
            changed = true;
          }
        }
      }
      continue;
    }

    const candidates = entityOutputCandidates(nodeId, node, producerOutputs, domain);
    for (const candidate of candidates) {
      const current = producerOutputs[candidate.producerOutputId];
      if (current) continue;
      producerOutputs[candidate.producerOutputId] = {
        producerOutputId: candidate.producerOutputId,
        nodeId,
        outputSocketId: candidate.outputSocketId,
        typeId: candidate.typeId,
        fields: { read: [], write: [], private: [] }
      };
      changed = true;
    }

    const actionId = String(node.entryTriggerId || node.id || recordId);
    const action = actions[actionId];
    // Identity binds entity-emitting species to their producer output; a
    // value-output service or command owns no producer identity however
    // it is typed (its type only places the run action).
    const requiresActionIdentity = ACTION_EFFECT_KINDS.has(opKind)
      && candidates.length > 0
      && Boolean(node.typeId || action?.typeId);
    const selectedId = node.producerOutputId || action?.producerOutputId || '';

    if (selectedId) {
      const selected = producerOutputs[selectedId];
      if (!selected && String(selectedId).startsWith(`${nodeId}:`)) {
        // Stale self-binding: the node's own output no longer resolves
        // (renamed socket, healed snapshot, withdrawn type). It names no
        // foreign identity, so dropping it cannot mask cross-node
        // corruption — fall through and re-derive below; validation owns
        // whatever stays unbound.
        if (String(node.producerOutputId || '').startsWith(`${nodeId}:`)) {
          delete node.producerOutputId;
          changed = true;
        }
        if (action && String(action.producerOutputId || '').startsWith(`${nodeId}:`)) {
          delete action.producerOutputId;
          changed = true;
        }
      } else {
        if (!selected) {
          errors.push(`Process node ${nodeId} selects missing producer output ${selectedId}`);
          continue;
        }
        const ownsProducedEntity = ['effect.createEntity', 'effect.runProducer'].includes(opKind);
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
    }

    if (!requiresActionIdentity) continue;
    const typeId = node.typeId || action?.typeId || '';
    const compatible = candidates.filter(candidate => !typeId || candidate.typeId === typeId);
    if (compatible.length !== 1) {
      // A type the supplied vocabulary does not know is validation's
      // report (unknown-type diagnostics carry node anchors there), not a
      // rewrite refusal: without this, deleting a type bricks every draft
      // that ever bound it. Applies only when the caller supplies a
      // vocabulary — without one, every type is unknown and the strict
      // rewrite stays.
      const vocabulary = (domain.entities || []).map(entity => entity?.type).filter(Boolean);
      if (typeId && vocabulary.length && !vocabulary.includes(typeId)) continue;
      errors.push(producerIdentityDiagnostic(nodeId, typeId, candidates));
      continue;
    }

    node.producerOutputId = compatible[0].producerOutputId;
    if (action) action.producerOutputId = compatible[0].producerOutputId;
    changed = true;
  }

  for (const [profileId, profile] of Object.entries(data.entityProfiles || {})) {
    const typeId = profile?.typeId || profileId;
    const candidates = Object.values(producerOutputs)
      .filter(output => output?.typeId === typeId)
      .sort((left, right) => left.producerOutputId.localeCompare(right.producerOutputId));
    if (candidates.length !== 1) {
      errors.push(`Entity profile ${profileId} requires one ${typeId} producer output; candidates: ${describeOutputs(candidates)}`);
      continue;
    }
    const output = candidates[0];
    const profileContract = { ...profile };
    delete profileContract.id;
    delete profileContract.typeId;
    producerOutputs[output.producerOutputId] = {
      ...output,
      ...profileContract,
      producerOutputId: output.producerOutputId,
      nodeId: output.nodeId,
      outputSocketId: output.outputSocketId,
      typeId: output.typeId
    };
    delete data.entityProfiles[profileId];
    changed = true;
  }
  if (data.entityProfiles && !Object.keys(data.entityProfiles).length) delete data.entityProfiles;

  if (changed) data.compiled = null;
  return { changed, data, errors };
}

function entityOutputCandidates(nodeId, node, producerOutputs, domain) {
  const opKindOf = record => String(record?.kind || '');
  const candidates = new Map();
  let declaredOutputs = [];
  try {
    // The twin-aware ports resolve type ids against the domain view:
    // without it, kebab org ids fall back to the legacy snake form and
    // never match the node's own binding.
    declaredOutputs = resolveCatalogNodePorts(node, {
      domain,
      blockComposition: domain.blockComposition?.[node.block] || null,
      command: domain.commands?.[node.commandId] || null
    }).outputs;
  } catch {
    declaredOutputs = [];
  }
  // Retired v4 records have no catalog contract anymore. Only the entity
  // mutation kinds had a structural entity result (the effect result was
  // always the typed entity output); command/socket/attachment effects
  // derived outputs from their contracts and stay underivable here.
  const V4_STRUCTURAL_ENTITY_RESULT = [
    'effect.createEntity',
    'effect.runProducer',
    'effect.updateEntity',
    'effect.changeStatus',
    'effect.archiveEntity'
  ];
  if (!declaredOutputs.length && node.typeId && V4_STRUCTURAL_ENTITY_RESULT.includes(opKindOf(node))) {
    declaredOutputs = [{ id: 'result', type: { base: 'entityRef', typeId: node.typeId } }];
  }
  for (const output of [...declaredOutputs, ...(node.outputs || [])]) {
    const typeId = ['entity', 'entityRef'].includes(output?.type?.base)
      ? output.type.typeId
      : output?.kind === 'entity' ? output.typeId : '';
    if (!output?.id || !typeId) continue;
    const producerOutputId = `${nodeId}:${output.id}`;
    candidates.set(producerOutputId, {
      producerOutputId,
      outputSocketId: String(output.id),
      typeId: String(typeId)
    });
  }
  for (const [producerOutputId, output] of Object.entries(producerOutputs || {})) {
    if (String(output?.nodeId) !== nodeId || !output?.outputSocketId || !output?.typeId) continue;
    candidates.set(producerOutputId, {
      producerOutputId,
      outputSocketId: String(output.outputSocketId),
      typeId: String(output.typeId)
    });
  }
  return [...candidates.values()].sort((left, right) => left.producerOutputId.localeCompare(right.producerOutputId));
}

function producerIdentityDiagnostic(nodeId, typeId, candidates) {
  const described = describeOutputs(candidates);
  return `Process node ${nodeId} requires one ${typeId || 'entity'} producer output; candidates: ${described}`;
}

function describeOutputs(candidates) {
  return candidates.length
    ? candidates.map(candidate => `${candidate.producerOutputId} (${candidate.typeId})`).join(', ')
    : 'none';
}
