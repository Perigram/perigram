// The artifact plane's remaining kind registry — only the contracts the
// live artifact flows still speak: the facade plugin's DXF source
// uploads and generateAttachment outputs (PDF passport, nesting
// layouts), its artifact templates, and camera-capture uploads.
// Everything else moved to CTS file types with payload traits (the
// documents/tech-drawing packs); legacy stored rows of retired kinds
// resolve no kind here and degrade to a download preview. The full
// artifact-entity retirement (facade plugin included) is the tracked
// payload-trait flip.
export const frameworkAttachmentKinds = {
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

// The kinds a command creates, derived from the vocabulary — the single
// derivation command definitions and prompts read (never a frozen list).
export function commandCreatedKinds(commandId = '') {
  return Object.values(frameworkAttachmentKinds)
    .filter(kind => kind.creation?.mode === 'command' && kind.creation?.commandId === commandId)
    .map(kind => kind.kind);
}
