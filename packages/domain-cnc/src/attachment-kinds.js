export const cncAttachmentKinds = {
  FACADE_MODEL_SOURCE: { kind: 'FACADE_MODEL_SOURCE', bucket: 'facadeModels', mimeType: 'model/gltf-binary', preview: { mode: 'model3d' }, creation: { mode: 'upload', accept: '.glb,.gltf,model/gltf-binary,model/gltf+json' }, editor: { mode: 'none' }, replacement: false },
  ARTIFACT_TEMPLATE_SOURCE: {kind: 'ARTIFACT_TEMPLATE_SOURCE',
    bucket: 'artifactTemplates',
    mimeType: 'application/octet-stream',
    preview: { mode: 'attachment' },
    creation: { mode: 'workflow' },
    editor: { mode: 'none' }
  },
  DXF_SOURCE: {kind: 'DXF_SOURCE',
    bucket: 'userDxf',
    mimeType: 'application/dxf',
    preview: { mode: 'download' },
    creation: {
      mode: 'upload',
      accept: '.dxf,application/dxf',
      fields: [
        { id: 'name', path: 'identity.name', type: 'string', required: true }
      ]
    },
    editor: { mode: 'none' }
  },
  SVG_PREVIEW: {kind: 'SVG_PREVIEW',
    bucket: 'userDxfFilesSvg',
    mimeType: 'image/svg+xml',
    preview: { mode: 'svg' },
    creation: { mode: 'workflow' },
    editor: { mode: 'none' }
  },
  CASSETTE_DXF: {kind: 'CASSETTE_DXF',
    bucket: 'cassettes',
    mimeType: 'application/dxf',
    preview: { mode: 'download' },
    creation: { mode: 'workflow' },
    editor: { mode: 'none' }
  },
  CAPTURE_PHOTO: {kind: 'CAPTURE_PHOTO',
    bucket: 'capturePhotos',
    mimeType: 'image/*',
    preview: { mode: 'image' },
    creation: { mode: 'workflow' },
    editor: { mode: 'none' }
  },
  LAYOUT_DXF: {kind: 'LAYOUT_DXF',
    bucket: 'nestDxf',
    mimeType: 'application/dxf',
    preview: { mode: 'dxf' },
    creation: { mode: 'command', commandId: 'generateAttachment' },
    editor: { mode: 'layout' }
  },
  LAYOUT_SVG: {kind: 'LAYOUT_SVG',
    bucket: 'nestSvg',
    mimeType: 'image/svg+xml',
    preview: { mode: 'svg' },
    creation: { mode: 'command', commandId: 'generateAttachment' },
    editor: { mode: 'none' }
  },
  PDF_PASSPORT: {kind: 'PDF_PASSPORT',
    bucket: 'artifacts',
    mimeType: 'application/pdf',
    preview: { mode: 'pdf' },
    creation: { mode: 'command', commandId: 'generateAttachment' },
    editor: { mode: 'layout' }
  }
};
