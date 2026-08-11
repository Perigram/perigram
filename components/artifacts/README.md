# COMPONENT: Artifact Viewers

`ArtifactViewer.vue` is the fixed format registry for artifact files. It reads
the domain attachment kind instead of accepting arbitrary component names.

- DXF and SVG use `DrawingCanvas`; SVG is rendered as an image reference rather
  than injected markup.
- Images, PDF, DOCX, text, CSV, and XLSX have dedicated viewer modes.
- `ArtifactTextEditor.vue` owns the editable UTF-8 text and CSV save path.
- `ArtifactDetail` supplies artifact DTOs and revision DTOs; the viewer never
  receives unauthorised file URLs.

The CSV editor renders an editable cell table and persists a replacement file,
therefore creating a new immutable artifact file revision. XLSX is intentionally
read-only.
