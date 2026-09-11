import { describe, expect, it } from 'vitest';
import { normalizeEntityOutputContracts, validateResultEntityOutputs } from './index.js';

const contracts = [
  { type: 'nesting_run', persistenceOwner: 'commandOwned', timing: 'immediate' },
  { type: 'sheet_design', persistenceOwner: 'commandOwned', timing: 'completion' },
  { type: 'project_draft', persistenceOwner: 'graphOwned', timing: 'immediate' }
];

describe('declared entity output contracts', () => {
  it('normalizes well-formed per-output declarations', () => {
    expect(normalizeEntityOutputContracts({
      entities: [{ type: 'cassette', persistenceOwner: 'commandOwned', timing: 'immediate' }]
    })).toEqual([{ type: 'cassette', persistenceOwner: 'commandOwned', timing: 'immediate' }]);
    expect(normalizeEntityOutputContracts({})).toEqual([]);
  });

  it('rejects undeclared legacy shapes and partial records', () => {
    expect(() => normalizeEntityOutputContracts({ entities: ['cassette'] }))
      .toThrow('must be a { type, persistenceOwner, timing } record');
    expect(() => normalizeEntityOutputContracts({ entities: [{ type: 'cassette' }] }))
      .toThrow("requires persistenceOwner 'commandOwned' or 'graphOwned'");
    expect(() => normalizeEntityOutputContracts({ entities: [{ type: 'cassette', persistenceOwner: 'commandOwned' }] }))
      .toThrow("requires timing 'immediate' or 'completion'");
  });

  it('rejects completion-timed outputs in an immediate result', () => {
    expect(validateResultEntityOutputs({
      contracts,
      entities: [{ type: 'sheet_design', id: 'design-1' }],
      phase: 'immediate'
    })).toEqual(['Entity output sheet_design is completion-timed and cannot populate an immediate result']);
  });

  it('allows a completion result to re-report immediate outputs alongside completion outputs', () => {
    expect(validateResultEntityOutputs({
      contracts,
      entities: [
        { type: 'nesting_run', id: 'run-1' },
        { type: 'sheet_design', id: 'design-1' }
      ],
      phase: 'completion'
    })).toEqual([]);
  });

  it('rejects undeclared entity outputs', () => {
    expect(validateResultEntityOutputs({
      contracts,
      entities: [{ type: 'remnant', id: 'remnant-1' }],
      phase: 'immediate'
    })).toEqual(['Result carries undeclared entity output remnant']);
  });

  it('rejects raw construction data on a command-owned output', () => {
    expect(validateResultEntityOutputs({
      contracts,
      entities: [{ type: 'nesting_run', data: { width: 1200 } }],
      phase: 'immediate'
    })).toEqual(['Command-owned entity output nesting_run must return a persisted entity reference']);
  });

  it('rejects a persisted entity on a graph-owned output', () => {
    expect(validateResultEntityOutputs({
      contracts,
      entities: [{ type: 'project_draft', id: 'draft-1' }],
      phase: 'immediate'
    })).toEqual(['Graph-owned entity output project_draft must not return a persisted entity; route raw construction data to an explicit persistence node']);
    expect(validateResultEntityOutputs({
      contracts,
      entities: [{ type: 'project_draft', data: { name: 'Draft' } }],
      phase: 'immediate'
    })).toEqual([]);
  });
});
