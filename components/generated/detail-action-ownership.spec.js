import { describe, expect, it } from 'vitest';
import {
  generatedInstanceDetailConsumesAction,
  generatedInstanceDetailOwnsActionSurface
} from './detail-action-ownership.js';

describe('generated detail action ownership', () => {
  it('keeps editor-owned actions out of surrounding entity action rows', () => {
    expect(generatedInstanceDetailOwnsActionSurface('queue')).toBe(true);
    expect(generatedInstanceDetailOwnsActionSurface('cassette')).toBe(true);
    expect(generatedInstanceDetailOwnsActionSurface('sheet_design')).toBe(true);
    expect(generatedInstanceDetailConsumesAction('queue', {
      actionKind: 'runCommand',
      commandId: 'solveNesting'
    })).toBe(true);
    expect(generatedInstanceDetailConsumesAction('cassette', {
      actionKind: 'updateInstance'
    })).toBe(true);
    expect(generatedInstanceDetailConsumesAction('sheet_design', {
      actionKind: 'updateInstance'
    })).toBe(true);
  });

  it('leaves unrelated entity commands to the surrounding action row', () => {
    expect(generatedInstanceDetailConsumesAction('artifact', {
      actionKind: 'sendToOrganization'
    })).toBe(false);
    expect(generatedInstanceDetailOwnsActionSurface('artifact')).toBe(false);
  });

  it('leaves generated relation mutations on the generic action surface', () => {
    expect(generatedInstanceDetailConsumesAction('queue', {
      actionKind: 'updateInstance',
      relationMutation: {
        key: 'cassettes',
        targetType: 'cassette_design',
        operation: 'link'
      }
    })).toBe(false);
    expect(generatedInstanceDetailConsumesAction('cassette', {
      actionKind: 'updateInstance',
      relationMutation: {
        key: 'library',
        targetType: 'library',
        operation: 'link'
      }
    })).toBe(false);
  });
});
