import { buildOccsFaceDimensionEntities } from './dimensions.js';

export const createDefaultOccsCassetteTemplateDefinition = () => ({
  occs: '0.4-draft',
  documentType: 'template',
  id: 'cassette-v2-tree',
  units: 'mm',
  parameters: { A: '500', B: '400', R: '35', T: '1' },
  definitions: {
    workpieces: [
      {
        id: 'wp_1_def',
        type: 'sheet',
        role: 'cassette_tray',
        faces: [
          {
            id: 'face_1',
            role: 'main',
            shape: {
              type: 'trapezoid',
              baseLength: 'A',
              height: 'B'
            }
          }
        ],
        folds: [],
        entities: buildOccsFaceDimensionEntities({
          faceId: 'face_1',
          shape: {
            type: 'trapezoid',
            baseLength: 'A',
            height: 'B'
          }
        })
      }
    ],
    libraryParts: []
  },
  cassette: {
    occurrences: [
      {
        id: 'wp_1',
        ref: 'wp_1_def',
        placement: {
          relativeTo: 'world',
          origin: ['0', '0', '0'],
          rotation: ['0deg', '0deg', '0deg']
        }
      }
    ],
    joints: []
  },
  extensions: {
    cutkit: {
      graphTree: {
        version: '0.4',
        parameters: { A: '500', B: '400', R: '35', T: '1' },
        rootId: 'face_1',
        workpieces: [
          {
            id: 'wp_1',
            name: 'Workpiece 1',
            rootId: 'face_1',
            definitionId: 'wp_1_def',
            occurrenceId: 'wp_1',
            previewOrigin: [0, 0, 0],
            placement: {
              relativeTo: 'world',
              origin: ['0', '0', '0'],
              rotation: ['0deg', '0deg', '0deg']
            }
          }
        ],
        joints: [],
        nodes: [
          {
            id: 'face_1',
            workpieceId: 'wp_1',
            operation: 'face.trapezoid',
            parentId: null,
            parentEdgeIndex: null,
            attachEdge: 'E0',
            parameters: {
              defaultLength: 'A',
              height: 'B',
              startAnchor: 0,
              endAnchor: 1,
              baseStartOffset: '0',
              baseEndOffset: '0',
              topStartOffset: '0',
              topEndOffset: '0'
            }
          }
        ]
      }
    }
  }
});
