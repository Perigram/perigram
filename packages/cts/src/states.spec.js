import { describe, expect, it } from 'vitest';
import {
  checkStateTotality,
  collectStateEntries,
  findState,
  initialStatePath,
  normalizeStates,
  normalizeTransitions
} from './states.js';

function machine() {
  return {
    main: {
      initial: 'PRODUCTION',
      states: {
        PRODUCTION: {
          initial: 'queued',
          policy: { label: 'Production' },
          states: {
            queued: { policy: { label: 'Queued' } },
            cutting: { policy: { label: 'Cutting', icon: 'pi pi-spinner' } }
          }
        },
        cutting: {},
        FAILED: { terminal: true }
      }
    },
    quality: {
      initial: 'OPEN',
      states: {
        OPEN: {},
        APPROVED: { terminal: true }
      }
    }
  };
}

describe('recursive CTS state machines', () => {
  it('normalizes every axis as a tree and derives canonical full-path display policy', () => {
    const normalized = normalizeStates(machine());
    expect(Object.keys(normalized)).toEqual(['main', 'quality']);
    expect(normalized.main.initial).toBe('PRODUCTION');
    expect(normalized.main.states.PRODUCTION.states.queued).toEqual({ policy: { label: 'Queued' } });
    expect(normalized.main.values).toBeUndefined();
    expect(normalized.main.terminal).toBeUndefined();
    expect(normalized.main.render).toMatchObject({
      PRODUCTION: { label: 'Production' },
      'PRODUCTION.cutting': { label: 'Cutting', icon: 'pi pi-spinner' }
    });
    expect(normalized.quality.states.APPROVED.terminal).toBe(true);
  });

  it('looks up exact full paths without local child aliases or collisions', () => {
    const axis = normalizeStates(machine()).main;
    expect(collectStateEntries(axis).map(entry => entry.path)).toEqual([
      'PRODUCTION',
      'PRODUCTION.queued',
      'PRODUCTION.cutting',
      'cutting',
      'FAILED'
    ]);
    expect(findState(axis, 'PRODUCTION.cutting')?.policy?.label).toBe('Cutting');
    expect(findState(axis, 'cutting')).toEqual({});
    expect(findState(axis, 'queued')).toBeNull();
    expect(initialStatePath(axis)).toBe('PRODUCTION.queued');
    expect(initialStatePath(axis, 'PRODUCTION.cutting')).toBe('PRODUCTION.cutting');
  });

  it('rejects flat axes, dotted local names, missing nested initials, and terminal parents', () => {
    expect(() => normalizeStates({ main: { initial: 'DRAFT', values: ['DRAFT'] } }))
      .toThrow(/flat state axes are retired/);
    expect(() => normalizeStates({ main: { initial: 'ready.done', states: { 'ready.done': {} } } }))
      .toThrow(/local state name ready.done/);
    expect(() => normalizeStates({
      main: { initial: 'ROOT', states: { ROOT: { states: { LEAF: {} } } } }
    })).toThrow(/ROOT requires exactly one initial child/);
    expect(() => normalizeStates({
      main: {
        initial: 'ROOT',
        states: { ROOT: { terminal: true, initial: 'LEAF', states: { LEAF: {} } } }
      }
    })).toThrow(/terminal state ROOT cannot declare children/);
  });

  it('rejects cyclic state objects', () => {
    const node = { initial: 'self', states: {} };
    node.states.self = node;
    expect(() => normalizeStates({ main: { initial: 'self', states: { self: node } } }))
      .toThrow(/cycle/);
  });

  it('validates transition paths per axis and keeps one deterministic target per intent', () => {
    const states = normalizeStates(machine());
    const transitions = normalizeTransitions([
      { axis: 'main', from: 'PRODUCTION.cutting', to: 'FAILED', intent: 'fail' },
      { axis: 'main', from: 'PRODUCTION', to: 'FAILED', intent: 'fail' }
    ], states);
    expect(transitions).toHaveLength(2);
    expect(() => normalizeTransitions([
      { axis: 'main', from: 'PRODUCTION.cutting', to: 'FAILED', intent: 'finish' },
      { axis: 'quality', from: 'OPEN', to: 'APPROVED', intent: 'finish' }
    ], states)).toThrow(/one intent has one target/);
    expect(() => normalizeTransitions([
      { axis: 'main', from: 'PRODUCTION.cutting', to: 'FAILED' }
    ], states)).not.toThrow();
    expect(() => normalizeTransitions([
      { from: 'PRODUCTION', to: 'FAILED' }
    ], states)).toThrow(/axis is required/);
  });

  it('checks explicitly terminal leaf reachability on every axis', () => {
    const type = {
      states: normalizeStates({
        main: {
          initial: 'A',
          states: {
            A: { initial: 'A1', states: { A1: {}, A2: {} } },
            DONE: { terminal: true }
          }
        },
        quality: {
          initial: 'OPEN',
          states: { OPEN: {}, APPROVED: { terminal: true } }
        }
      }),
      transitions: normalizeTransitions([
        { axis: 'main', from: 'A', to: 'DONE' },
        { axis: 'quality', from: 'OPEN', to: 'APPROVED' }
      ], normalizeStates({
        main: {
          initial: 'A',
          states: {
            A: { initial: 'A1', states: { A1: {}, A2: {} } },
            DONE: { terminal: true }
          }
        },
        quality: {
          initial: 'OPEN',
          states: { OPEN: {}, APPROVED: { terminal: true } }
        }
      }))
    };
    expect(checkStateTotality(type)).toEqual([]);
  });
});
