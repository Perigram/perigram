// Flat state vocabularies (SPEC §7): a state is one flat string value. No
// axes, no nesting, no parents, no derived configuration — the vocabulary
// helper validates the shape shared by draft state-node projection and the
// compiled contract. Failure modes first: nesting keys, dotted values,
// non-true terminal, malformed policy, non-object vocabulary.
import { describe, expect, it } from 'vitest';
import {
  normalizeStateVocabulary, normalizeStatePolicy,
  stateValues, statePolicy, isTerminalState
} from './states.js';
import { normalizeType } from './registry.js';

describe('flat state vocabularies', () => {
  it('normalizes a flat vocabulary with terminal flags and policy', () => {
    const vocabulary = normalizeStateVocabulary({
      draft: {},
      active: true,
      archived: { terminal: true, policy: { label: 'Archived', severity: 'secondary' } }
    });
    expect(stateValues(vocabulary)).toEqual(['draft', 'active', 'archived']);
    expect(isTerminalState(vocabulary, 'archived')).toBe(true);
    expect(isTerminalState(vocabulary, 'draft')).toBe(false);
    expect(isTerminalState(vocabulary, 'missing')).toBe(false);
    expect(statePolicy(vocabulary, 'archived')).toEqual({ label: 'Archived', severity: 'secondary' });
    expect(statePolicy(vocabulary, 'draft')).toBeNull();
  });

  it('rejects every nesting key — states, initial, and parent are retired', () => {
    expect(() => normalizeStateVocabulary({ ready: { states: { done: {} } } }))
      .toThrow(/nesting is retired/);
    expect(() => normalizeStateVocabulary({ ready: { initial: 'done' } }))
      .toThrow(/nesting is retired/);
    expect(() => normalizeStateVocabulary({ ready: { parent: 'draft' } }))
      .toThrow(/nesting is retired/);
  });

  it('rejects dotted values, empty values, and non-true terminal flags', () => {
    expect(() => normalizeStateVocabulary({ 'available.queued': {} }))
      .toThrow(/one flat segment/);
    expect(() => normalizeStateVocabulary({ '': {} }))
      .toThrow(/one flat segment/);
    expect(() => normalizeStateVocabulary({ ready: { terminal: false } }))
      .toThrow(/terminal must be true/);
  });

  it('rejects malformed vocabularies and policies', () => {
    expect(() => normalizeStateVocabulary(null)).toThrow(/must be an object/);
    expect(() => normalizeStateVocabulary(['ready'])).toThrow(/must be an object/);
    expect(() => normalizeStateVocabulary({ ready: 'yes' })).toThrow(/must be an object or true/);
    expect(() => normalizeStatePolicy('bold')).toThrow(/must be an object/);
    expect(normalizeStatePolicy({ label: 4, icon: null, severity: 'info' })).toEqual({ label: '4', severity: 'info' });
  });
});

describe('class state vocabulary', () => {
  it('lives on stateVocabulary and ignores the legacy states facet', () => {
    const type = normalizeType({
      id: 'class-with-states',
      class: 'item',
      fields: { name: { base: 'string', identifier: true } },
      stateVocabulary: {
        draft: { policy: { label: 'Draft' } },
        archived: { terminal: true }
      }
    });
    expect(type.stateVocabulary.archived.terminal).toBe(true);
    expect(type.stateVocabulary.draft.policy.label).toBe('Draft');

    const legacy = normalizeType({
      id: 'legacy-states',
      class: 'file',
      fields: { name: { base: 'string', identifier: true } },
      states: { main: { initial: 'draft', states: { draft: {} } } }
    });
    expect(legacy.stateVocabulary).toBeUndefined();
  });
});
