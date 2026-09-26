export const frameworkAttachmentKinds = {
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
    preview: { mode: 'dxf' },
    creation: {
      mode: 'upload',
      accept: '.dxf,application/dxf',
      fields: [
        { id: 'name', path: 'identity.name', type: 'string', required: true }
      ]
    },
    editor: { mode: 'none' },
    file: { extensions: ['.dxf'], mimeTypes: ['application/dxf', 'application/x-dxf'], maxBytes: 50 * 1024 * 1024 }
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
    creation: { mode: 'capture', accept: 'image/jpeg,image/png', capture: 'environment' },
    editor: { mode: 'none' },
    file: { extensions: ['.jpg', '.jpeg', '.png'], mimeTypes: ['image/jpeg', 'image/png'], maxBytes: 25 * 1024 * 1024 }
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
  },
  SVG_FILE: {kind: 'SVG_FILE',
    bucket: 'uploads', mimeType: 'image/svg+xml', preview: { mode: 'svg' },
    creation: { mode: 'upload', accept: '.svg,image/svg+xml' }, editor: { mode: 'none' },
    file: { extensions: ['.svg'], mimeTypes: ['image/svg+xml'], maxBytes: 10 * 1024 * 1024 }
  },
  IMAGE_FILE: {kind: 'IMAGE_FILE',
    bucket: 'uploads', mimeType: 'image/*', preview: { mode: 'image' },
    creation: { mode: 'upload', accept: 'image/jpeg,image/png' }, editor: { mode: 'none' },
    file: { extensions: ['.jpg', '.jpeg', '.png'], mimeTypes: ['image/jpeg', 'image/png'], maxBytes: 25 * 1024 * 1024 }
  },
  PDF_DOCUMENT: {kind: 'PDF_DOCUMENT',
    bucket: 'uploads', mimeType: 'application/pdf', preview: { mode: 'pdf' },
    creation: { mode: 'upload', accept: '.pdf,application/pdf' }, editor: { mode: 'none' },
    file: { extensions: ['.pdf'], mimeTypes: ['application/pdf'], maxBytes: 25 * 1024 * 1024 }
  },
  DOCX_DOCUMENT: {kind: 'DOCX_DOCUMENT',
    bucket: 'uploads', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', preview: { mode: 'docx' },
    creation: { mode: 'upload', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, editor: { mode: 'none' },
    file: { extensions: ['.docx'], mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxBytes: 25 * 1024 * 1024 }
  },
  TEXT_FILE: {kind: 'TEXT_FILE',
    bucket: 'uploads', mimeType: 'text/plain', preview: { mode: 'text' },
    creation: { mode: 'upload', accept: '.txt,text/plain' }, editor: { mode: 'text' },
    file: { extensions: ['.txt'], mimeTypes: ['text/plain'], maxBytes: 10 * 1024 * 1024 }
  },
  TEXT_DOCUMENT: {kind: 'TEXT_DOCUMENT',
    bucket: 'uploads', mimeType: 'text/plain', preview: { mode: 'text' },
    creation: { mode: 'editor' }, editor: { mode: 'text' },
    file: { extensions: ['.txt'], mimeTypes: ['text/plain'], maxBytes: 10 * 1024 * 1024 }
  },
  CSV_FILE: {kind: 'CSV_FILE',
    bucket: 'uploads', mimeType: 'text/csv', preview: { mode: 'table' },
    creation: { mode: 'upload', accept: '.csv,text/csv' }, editor: { mode: 'csv' },
    file: { extensions: ['.csv'], mimeTypes: ['text/csv', 'application/csv'], maxBytes: 10 * 1024 * 1024 }
  },
  CSV_TABLE: {kind: 'CSV_TABLE',
    bucket: 'uploads', mimeType: 'text/csv', preview: { mode: 'table' },
    creation: { mode: 'editor' }, editor: { mode: 'csv' },
    file: { extensions: ['.csv'], mimeTypes: ['text/csv', 'application/csv'], maxBytes: 10 * 1024 * 1024 }
  },
  XLSX_WORKBOOK: {kind: 'XLSX_WORKBOOK',
    bucket: 'uploads', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', preview: { mode: 'workbook' },
    creation: { mode: 'upload', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, editor: { mode: 'none' },
    file: { extensions: ['.xlsx'], mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], maxBytes: 25 * 1024 * 1024 }
  },
  SKETCH: {kind: 'SKETCH',
    bucket: 'sketches',
    mimeType: 'application/json',
    preview: { mode: 'sketch' },
    creation: {
      mode: 'editor',
      initial: {
        fileName: 'sketch.json',
        mimeType: 'application/json',
        content: '{"version":1,"strokes":[]}'
      }
    },
    editor: { mode: 'sketch' },
    file: { extensions: ['.json'], mimeTypes: ['application/json'], maxBytes: 25 * 1024 * 1024 }
  }
};
