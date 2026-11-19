// Operators (SPEC §8): six species, typed signatures, triggers.
// Reaction, not observation: only a call, a trigger, or a task retry wakes one.
import { describeType, containsRef } from './values.js';

const OPERATOR_SPECIES = Object.freeze(['construct', 'mutate', 'transition', 'conversion', 'projection', 'service']);

export function normalizeOperator(operator = {}) {
  const { id, species, input, output, triggers = [], declaringType = null } = operator;
  if (!id) throw new Error('operator requires id');
  if (!OPERATOR_SPECIES.includes(species)) {
    throw new Error(`operator ${id}: unknown species ${species}`);
  }

  const normalized = {
    id,
    species,
    declaringType: declaringType || null,
    input: input ? describeType(input) : null,
    output: output ? describeType(output) : null,
    triggers: normalizeTriggers(id, triggers)
  };

  // R5: services and projections exchange V — no entity pointers inside.
  if ((species === 'service' || species === 'projection')) {
    if (normalized.input && containsRef(normalized.input)) {
      throw new Error(`operator ${id}: ${species} input must not contain Ref (entities reach services solely via projection)`);
    }
    if (normalized.output && containsRef(normalized.output)) {
      throw new Error(`operator ${id}: ${species} output must not contain Ref`);
    }
  }
  if (species === 'mutate' || species === 'transition') {
    if (!normalized.input?.base || normalized.input.base !== 'ref') {
      throw new Error(`operator ${id}: ${species} requires a Ref input`);
    }
  }
  if (species === 'conversion' && (!normalized.input?.accepts?.length || !normalized.output)) {
    throw new Error(`operator ${id}: conversion requires Ref input and declared output`);
  }
  return Object.freeze(normalized);
}

function normalizeTriggers(operatorId, triggers = []) {
  return Object.freeze(triggers.map((trigger = {}, index) => {
    const event = trigger.event || null;
    const schedule = trigger.schedule || null;
    if (!event && !schedule) {
      throw new Error(`operator ${operatorId} trigger ${index}: requires event or schedule`);
    }
    if (event && schedule) {
      throw new Error(`operator ${operatorId} trigger ${index}: event and schedule are mutually exclusive`);
    }
    return Object.freeze(event ? { event } : { schedule });
  }));
}
