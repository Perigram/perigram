import { describe, expect, it } from 'vitest';
import { getEntityConstruction } from './entity-construction.js';

describe('CNC entity construction', () => {
  it('requires the typed artifact upload flow instead of a generic name-only create', () => {
    const contract = getEntityConstruction('artifact');

    expect(contract).toMatchObject({ defaultMode: 'uploadArtifact', derived: true });
    expect(contract.modeInputs.uploadArtifact[0]).toMatchObject({
      type: 'artifactUpload',
      creator: { entityType: 'artifact', attachmentKinds: 'userCreatable' }
    });
  });

  it('treats cassette creation as an ordinary entity create contract', () => {
    const contract = getEntityConstruction('cassette');

    expect(contract.defaultMode).toBe('genericCreate');
    expect(contract.modes).toEqual(['genericCreate']);
    expect(contract.inputs).toEqual([]);
  });

  it('keeps facade construction independent of its containment parent', () => {
    const contract = getEntityConstruction('facade');

    expect(contract.parentEntityType).toBeUndefined();
    expect(contract.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'name', prompt: true }),
      expect.objectContaining({ id: 'sourceModelId', entityType: 'artifact' })
    ]));
  });
});
