import { describe, expect, it } from 'vitest';
import {
  generatedEntityDetailConsumesAction,
  generatedEntityDetailOwnsActionSurface
} from './detail-action-ownership.js';

describe('generated detail action ownership', () => {
  it('keeps editor-owned actions out of surrounding entity action rows', () => {
    expect(generatedEntityDetailOwnsActionSurface('queue')).toBe(true);
    expect(generatedEntityDetailOwnsActionSurface('cassette')).toBe(true);
    expect(generatedEntityDetailOwnsActionSurface('sheet_design')).toBe(true);
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
    expect(generatedEntityDetailConsumesAction('artifact', {
      actionKind: 'sendToOrganization'
    })).toBe(false);
    expect(generatedEntityDetailOwnsActionSurface('artifact')).toBe(false);
  });
});
