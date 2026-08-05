import { describe, expect, it } from 'vitest';
import { generatedEntityDetailConsumesAction } from './detail-action-ownership.js';

describe('generated detail action ownership', () => {
  it('keeps editor-owned actions out of surrounding entity action rows', () => {
    expect(generatedEntityDetailConsumesAction('queue', {
      actionKind: 'runCommand',
      commandId: 'solveNesting'
    })).toBe(true);
    expect(generatedEntityDetailConsumesAction('cassette', {
      actionKind: 'updateEntity'
    })).toBe(true);
    expect(generatedEntityDetailConsumesAction('sheet_design', {
      actionKind: 'updateEntity'
    })).toBe(true);
  });

  it('leaves unrelated entity commands to the surrounding action row', () => {
    expect(generatedEntityDetailConsumesAction('queue', {
      actionKind: 'sendToOrganization'
    })).toBe(false);
    expect(generatedEntityDetailConsumesAction('cassette', {
      actionKind: 'sendToOrganization'
    })).toBe(false);
  });
});
