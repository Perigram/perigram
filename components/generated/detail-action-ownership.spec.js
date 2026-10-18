import { describe, expect, it } from 'vitest';
import { resolveFileSurface } from './file-surfaces.js';
import {
  generatedInstanceDetailConsumesAction,
  generatedInstanceDetailOwnsActionSurface
} from './detail-action-ownership.js';

const servedSurfaces = [{
  id: 'cassette-designer',
  url: 'http://127.0.0.1:8790/surfaces/cassette-designer.mjs',
  surfaceContract: 2
}];
const servedEditors = [{ type: 'cassette', surface: 'cassette-designer', modes: ['edit'] }];

describe('generated detail action ownership', () => {
  it('keeps editor-owned actions out of surrounding entity action rows', () => {
    expect(generatedInstanceDetailOwnsActionSurface('queue')).toBe(true);
    // Editor-bound types own their surface through the served registry
    // (file-surfaces owns the binding contract); a unit context without a
    // served view resolves none.
    expect(resolveFileSurface(servedEditors, 'cassette', servedSurfaces)?.workspacePage).toBeTruthy();
    expect(generatedInstanceDetailConsumesAction('queue', {
      actionKind: 'runCommand',
      commandId: 'solveNesting'
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
