export const cncArtifactConversions = [
  {
    id: 'layoutDxfToDxfSource',
    label: 'Create DXF source',
    sourceKinds: ['LAYOUT_DXF'],
    target: { kind: 'artifact', artifactKind: 'DXF_SOURCE' }
  },
  {
    id: 'dxfSourceToCassetteDesign',
    label: 'Import cassette design',
    sourceKinds: ['DXF_SOURCE'],
    target: {
      kind: 'entity',
      entityType: 'cassette_design',
      constructionMode: 'importCassetteDesignFromArtifact'
    }
  }
];

export function getArtifactConversion(id) {
  return cncArtifactConversions.find(conversion => conversion.id === id) || null;
}
