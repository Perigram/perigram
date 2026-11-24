import { constructionInputsForContract } from './node-catalog.js';

export function constructionContract(domain = {}, typeId = '') {
  return domain.construction?.[typeId] || null;
}

export function normalizeConstruction(construction = {}, typeId = '', domain = {}) {
  const contract = constructionContract(domain, typeId);
  if (!contract) return null;
  const source = construction || {};
  const modes = Array.isArray(contract.modes) ? contract.modes : [];
  const mode = source.mode
    ? source.mode
    : (modes.includes(contract.defaultMode) ? contract.defaultMode : (modes[0] || ''));
  const declaredInputs = Array.isArray(source.inputs) ? source.inputs : [];
  const blocksOwnConstruction = source.blockComposed && mode === 'genericCreate';
  const contractInputsRaw = constructionInputsForContract(contract, mode);
  // Lineage axes are contract vocabulary (the containment declaration
  // owns them): the contract's current lineage set is the addressable
  // set on every construction, block-composed or not.
  const contractLineage = new Set(contractInputsRaw
    .map(input => String(input.id || input.path || ''))
    .filter(path => path.startsWith('lineage.')));
  const contractInputs = contractInputsRaw
    .filter(input => !blocksOwnConstruction || !isCanonicalBlockConstructionPath(input.path));
  // A declared mode (creation protocols, construct operators) addresses
  // exactly its mode inputs plus edges, and every authored input
  // addresses the current contract (a block-composed construct keeps
  // its canonical block entries): authored inputs outside that set are
  // stale contract stamps, dropped here instead of surviving as prompts.
  const restrictToContract = contract.derived || Object.hasOwn(contract.modeInputs || {}, mode);
  const inputsById = new Map(contractInputs.map(input => {
    const normalizedInput = normalizeConstructionInput(input, domain);
    return [normalizedInput.id || normalizedInput.path, normalizedInput];
  }));
  for (const input of declaredInputs) {
    const key = input.id || input.path;
    if (String(input.path || key || '').startsWith('lineage.') && !contractLineage.has(key)) continue;
    const contractInput = inputsById.get(key);
    const composedBlock = blocksOwnConstruction && isCanonicalBlockConstructionPath(input.path);
    if (!contractInput && (restrictToContract || !composedBlock)) continue;
    inputsById.set(key, contractInput
      ? mergeConstructionInput(contractInput, input)
      : { ...input }
    );
  }
  return {
    mode,
    ...(source.blockComposed ? { blockComposed: true } : {}),
    // Emitted creators stay on the canonical expanded [{ kind, creation }]
    // shape (law: README Create and update effects).
    inputs: [...inputsById.values()].map(input => normalizeConstructionInput(input, domain))
  };
}

function isCanonicalBlockConstructionPath(path = '') {
  return ['fields', 'lineage', 'relations', 'name']
    .some(block => String(path).startsWith(`${block}.`) || String(path) === block);
}

function normalizeConstructionInput(input = {}, domain = {}) {
  if (typeof input.creator?.attachmentKinds !== 'string') {
    return { ...input };
  }
  return {
    ...input,
    creator: {
      ...input.creator,
      attachmentKinds: Object.values(domain.attachmentKinds || {})
        .filter(kind => ['upload', 'capture', 'editor'].includes(kind.creation?.mode))
        .map(kind => ({ kind: kind.kind || kind.id, creation: kind.creation }))
    }
  };
}

export function resolveParentRevision(parentRevision = {}, parentTypeId = '', domain = {}) {
  const contract = domain.revisions?.[parentTypeId] || {};
  const scopes = Array.isArray(contract.scopes) ? contract.scopes : [];
  const requestedScope = parentRevision.scope || contract.defaultScope || scopes[0] || '';
  return {
    enabled: parentRevision.enabled === true,
    scope: scopes.includes(requestedScope) ? requestedScope : (contract.defaultScope || scopes[0] || requestedScope)
  };
}

function mergeConstructionInput(contractInput = {}, declaredInput = {}) {
  return {
    ...declaredInput,
    ...contractInput,
    ...(contractInput.creator || declaredInput.creator ? {
      creator: { ...(contractInput.creator || {}), ...(declaredInput.creator || {}) }
    } : {}),
    default: declaredInput.default ?? contractInput.default,
    value: declaredInput.value ?? contractInput.value,
    prompt: declaredInput.prompt ?? contractInput.prompt,
    required: Boolean(declaredInput.required === true || contractInput.required === true)
  };
}

function normalizeInputPolicy(inputPolicy = {}) {
  return {
    prompt: inputPolicy.prompt !== false,
    fields: Array.isArray(inputPolicy.fields)
      ? inputPolicy.fields.map(field => ({ ...field, required: field.required === true }))
      : []
  };
}

export function normalizeActionInputPolicy(inputPolicy = {}, construction = {}, typeId = '', domain = {}) {
  const normalizedConstruction = normalizeConstruction(construction, typeId, domain) || { inputs: [] };
  const policyFields = Array.isArray(inputPolicy.fields) ? inputPolicy.fields : [];
  const fieldsById = new Map(
    normalizedConstruction.inputs
      .filter(input => input.prompt)
      .map(input => [input.id || input.path, { ...input }])
  );
  // One prompt row per addressed value: a policy field keyed `field:<path>`
  // addresses the same value as the construction input carrying that path,
  // so it merges into that input instead of adding a second row.
  const keyOfConstructionPath = path => {
    const input = normalizedConstruction.inputs.find(candidate => (candidate.id || candidate.path) === path);
    return input ? (input.id || input.path) : null;
  };
  const contract = constructionContract(domain, typeId);
  const restrictToContract = Boolean(contract?.derived)
    || Object.hasOwn(contract?.modeInputs || {}, normalizedConstruction.mode || '');
  for (const field of policyFields) {
    const key = field.id || field.path;
    const constructionKey = keyOfConstructionPath(field.path) || key;
    const constructionField = normalizedConstruction.inputs.find(input => (input.id || input.path) === constructionKey);
    if (restrictToContract && !constructionField) continue;
    const merged = constructionField
      ? mergeConstructionInput(constructionField, field)
      : {
          ...(fieldsById.get(constructionKey) || {}),
          ...field,
          ...(constructionKey !== key ? { id: constructionKey } : {})
        };
    if (merged.prompt || !constructionField) fieldsById.set(constructionKey, { ...merged, ...(constructionKey !== key ? { id: constructionKey } : {}) });
    else fieldsById.delete(constructionKey);
  }
  const fields = [...fieldsById.values()].map(field => normalizeConstructionInput(field, domain));
  return {
    prompt: inputPolicy.prompt !== false && fields.some(field => field.prompt),
    fields
  };
}

export function compiledInputPolicy(action = {}, domain = {}) {
  return (action.actionKind || 'createEntity') === 'createEntity'
    ? normalizeActionInputPolicy(action.inputPolicy, action.construction, action.typeId, domain)
    : normalizeInputPolicy(action.inputPolicy);
}
