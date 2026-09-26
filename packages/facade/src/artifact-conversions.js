export const facadeArtifactConversions = [
  {
    id: 'layoutDxfToDxfSource',
    label: 'Create DXF source',
    sourceKinds: ['LAYOUT_DXF'],
    target: { kind: 'artifact', artifactKind: 'DXF_SOURCE' }
  },
  {
    id: 'dxfSourceToCassette',
    label: 'Import cassette',
    sourceKinds: ['DXF_SOURCE'],
    target: { kind: 'entity', typeId: 'cassette' }
  }
];

export function getArtifactConversion(id) {
  return facadeArtifactConversions.find(conversion => conversion.id === id) || null;
}
