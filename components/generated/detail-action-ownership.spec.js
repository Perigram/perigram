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
      actionKind: 'updateInstance'
    })).toBe(true);
    expect(generatedEntityDetailConsumesAction('sheet_design', {
      actionKind: 'updateInstance'
    })).toBe(true);
  });

  it('leaves unrelated entity commands to the surrounding action row', () => {
    expect(generatedEntityDetailConsumesAction('artifact', {
      actionKind: 'sendToOrganization'
    })).toBe(false);
    expect(generatedEntityDetailOwnsActionSurface('artifact')).toBe(false);
  });

  it('leaves generated relation mutations on the generic action surface', () => {
    expect(generatedEntityDetailConsumesAction('queue', {
      actionKind: 'updateInstance',
      relationMutation: {
        key: 'cassettes',
        targetType: 'cassette_design',
        operation: 'link'
      }
    })).toBe(false);
    expect(generatedEntityDetailConsumesAction('cassette', {
      actionKind: 'updateInstance',
      relationMutation: {
        key: 'library',
        targetType: 'library',
        operation: 'link'
      }
    })).toBe(false);
  });
});
