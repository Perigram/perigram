export const cncAttachmentKinds = {
  DXF_SOURCE: {kind: 'DXF_SOURCE',
    bucket: 'userDxf',
    mimeType: 'application/dxf',
    preview: { mode: 'download' }
  },
  SVG_PREVIEW: {kind: 'SVG_PREVIEW',
    bucket: 'userDxfFilesSvg',
    mimeType: 'image/svg+xml',
    preview: { mode: 'svg' }
  },
  CASSETTE_DXF: {kind: 'CASSETTE_DXF',
    bucket: 'cassettes',
    mimeType: 'application/dxf',
    preview: { mode: 'download' }
  },
  CAPTURE_PHOTO: {kind: 'CAPTURE_PHOTO',
    bucket: 'capturePhotos',
    mimeType: 'image/*',
    preview: { mode: 'image' }
  },
  LAYOUT_DXF: {kind: 'LAYOUT_DXF',
    bucket: 'nestDxf',
    mimeType: 'application/dxf',
    preview: { mode: 'dxf' }
  },
  LAYOUT_SVG: {kind: 'LAYOUT_SVG',
    bucket: 'nestSvg',
    mimeType: 'image/svg+xml',
    preview: { mode: 'svg' }
  },
  PDF_PASSPORT: {kind: 'PDF_PASSPORT',
    bucket: 'artifacts',
    mimeType: 'application/pdf',
    preview: { mode: 'pdf' }
  }
};
