import { describe, expect, it } from 'vitest';
import { cncCommands } from './commands.js';
import { getArtifactConversion } from './artifact-conversions.js';

describe('artifact conversion contract', () => {
  it('declares compatible artifact and entity targets through one command', () => {
    expect(getArtifactConversion('layoutDxfToDxfSource')).toMatchObject({
      sourceKinds: ['LAYOUT_DXF'],
      target: { kind: 'artifact', artifactKind: 'DXF_SOURCE' }
    });
    expect(getArtifactConversion('dxfSourceToCassetteDesign')).toMatchObject({
      sourceKinds: ['DXF_SOURCE'],
      target: { kind: 'entity', entityType: 'cassette_design' }
    });
    expect(cncCommands.convertArtifact).toMatchObject({
      input: { entities: [expect.objectContaining({ name: 'artifact', prompt: false })] },
      output: { entities: ['artifact', 'cassette_design'] }
    });
  });
});
