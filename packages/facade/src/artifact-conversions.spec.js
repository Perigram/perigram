import { facadeCommands } from "./commands.js";
import { getArtifactConversion } from './artifact-conversions.js';

describe('artifact conversion contract', () => {
  it('declares compatible artifact and entity targets through one command', () => {
    expect(getArtifactConversion('layoutDxfToDxfSource')).toMatchObject({
      sourceKinds: ['LAYOUT_DXF'],
      target: { kind: 'artifact', artifactKind: 'DXF_SOURCE' }
    });
    expect(getArtifactConversion('dxfSourceToCassette')).toMatchObject({
      sourceKinds: ['DXF_SOURCE'],
      target: { kind: 'entity', typeId: 'cassette' }
    });
    expect(facadeCommands.convertArtifact).toMatchObject({
      input: { entities: [expect.objectContaining({ name: 'artifact', prompt: false })] },
      output: {
        entities: [
          expect.objectContaining({ type: 'artifact', persistenceOwner: 'commandOwned', timing: 'immediate' }),
          expect.objectContaining({ type: 'cassette', persistenceOwner: 'commandOwned', timing: 'immediate' })
        ]
      }
    });
  });
});
