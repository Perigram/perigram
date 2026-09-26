// Facade pack trigger declarations: the domain events the pack's commands
// and surfaces emit or consume. Queue-era nesting events died with the
// queue flow — the registered V->V solver service emits none.
export const facadeEvents = {
  cassetteTemplateSaved: {
    id: 'cassette.templateSaved',
    label: 'Cassette template saved',
    informational: true
  },
  attachmentGenerationRequested: {
    id: 'attachment.generationRequested',
    label: 'Attachment generation requested'
  },
  attachmentGenerationQueued: {
    id: 'attachment.generationQueued',
    label: 'Attachment generation queued',
    informational: true
  },
  attachmentGenerationCompleted: {
    id: 'attachment.generationCompleted',
    label: 'Attachment generation completed',
    informational: true
  },
  attachmentGenerationFailed: {
    id: 'attachment.generationFailed',
    label: 'Attachment generation failed',
    informational: true
  },
  artifactConverted: {
    id: 'artifact.converted',
    label: 'Artifact converted',
    informational: true
  },
  geometryCapturePhotoUploaded: {
    id: 'geometryCapture.photoUploaded',
    label: 'Geometry capture photo uploaded'
  },
  geometryCaptureExtracted: {
    id: 'geometryCapture.extracted',
    label: 'Geometry capture extracted',
    informational: true
  },
  geometryCaptureFailed: {
    id: 'geometryCapture.failed',
    label: 'Geometry capture failed',
    informational: true
  }
};
