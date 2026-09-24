import { describe, expect, it } from 'vitest';
import { compiledWorkflowFor, getWorkflowStateActions, hasMeaningfulWorkflowState, hasWorkflow, workflowStateCount } from './state-actions.js';

const workflows = {
  recorded: {
    primaryRegion: 'main',
    regions: {
      main: { initial: 'RECORDED', states: { RECORDED: {} }, transitions: [] }
    }
  },
  production: {
    primaryRegion: 'main',
    regions: {
      main: {
        initial: 'DRAFT',
        states: { DRAFT: {}, READY: {} },
        transitions: [{ from: 'DRAFT', to: 'READY' }]
      }
    }
  }
};

const compiledRecord = {
  id: 'queue',
  states: {
    main: {
      initial: 'draft',
      states: {
        draft: {},
        nesting: {},
        ready: {},
        closed: { terminal: true }
      },
      render: {
        draft: { label: 'Draft', icon: null, severity: 'info' },
        nesting: { label: 'Nesting', icon: 'pi pi-cog', severity: 'warn' },
        ready: { label: 'Ready', icon: 'pi pi-check', severity: 'success' },
        closed: { label: 'Closed', icon: null, severity: 'secondary' }
      }
    },
    quality: {
      initial: 'unchecked',
      states: { unchecked: {}, passed: {} },
      render: { passed: { label: 'Passed', severity: 'success' } }
    }
  },
  transitions: [
    { axis: 'main', from: 'draft', to: 'nesting', intent: 'requestNesting' },
    { axis: 'main', from: 'nesting', to: 'ready', intent: 'completeNesting' },
    { axis: 'quality', from: 'unchecked', to: 'passed', intent: 'pass' }
  ]
};

describe('status visibility', () => {
  it('hides lifecycle status only when the effective workflow has one state', () => {
    expect(workflowStateCount('recorded', workflows)).toBe(1);
    expect(hasMeaningfulWorkflowState('recorded', workflows)).toBe(false);
    expect(hasMeaningfulWorkflowState('production', workflows)).toBe(true);
    expect(hasMeaningfulWorkflowState('unknown', workflows)).toBe(true);
  });

  it('matches canonical snake-case workflow keys from camel-case UI types', () => {
    expect(hasMeaningfulWorkflowState('entityRevision', {
      entity_revision: workflows.recorded
    })).toBe(false);
  });
});

describe('compiled-contract workflows', () => {
  it('converts a bundle type record into the v2 machine shape', () => {
    const compiled = compiledWorkflowFor(compiledRecord);
    expect(compiled).toMatchObject({
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'draft',
          transitions: [
            { from: 'draft', to: 'nesting', intent: 'requestNesting' },
            { from: 'nesting', to: 'ready', intent: 'completeNesting' }
          ]
        }
      }
    });
    expect(Object.keys(compiled.regions.main.states)).toEqual([
      'draft', 'nesting', 'ready', 'closed'
    ]);
    expect(Object.keys(compiled.regions.quality.states)).toEqual(['unchecked', 'passed']);
    expect(compiled._stateRender).toEqual({
      main: compiledRecord.states.main.render,
      quality: compiledRecord.states.quality.render
    });
  });

  it('returns null for records without a states facet', () => {
    expect(compiledWorkflowFor(null)).toBeNull();
    expect(compiledWorkflowFor({ id: 'image', states: {} })).toBeNull();
    expect(compiledWorkflowFor({ id: 'x', states: { main: { initial: 'a' } } })).toBeNull();
  });

  it('answers workflow questions from the compiled record before legacy fallbacks', () => {
    const compiled = compiledWorkflowFor(compiledRecord);
    expect(hasWorkflow('queue', {}, compiled)).toBe(true);
    expect(hasWorkflow('queue', {})).toBe(false);
    expect(workflowStateCount('queue', {}, compiled)).toBe(6);
    expect(hasMeaningfulWorkflowState('queue', {}, compiled)).toBe(true);
  });

  it('derives transition actions with authored display policy from the compiled record', () => {
    const actions = getWorkflowStateActions({
      typeId: 'queue',
      state: { primary: 'draft', active: { main: 'draft' } },
      compiled: compiledWorkflowFor(compiledRecord)
    });
    expect(actions).toEqual([
      expect.objectContaining({
        to: 'nesting',
        intent: 'requestNesting',
        label: 'Nesting',
        severity: 'warn',
        icon: 'pi pi-cog',
        display: 'inline',
        region: 'main'
      }),
      expect.objectContaining({
        to: 'passed',
        intent: 'pass',
        label: 'Passed',
        severity: 'success',
        display: 'inline',
        region: 'quality'
      })
    ]);
  });
});
