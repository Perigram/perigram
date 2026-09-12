# COMPONENT: Artifact Viewers

`ArtifactViewer.vue` is the fixed format registry for artifact files. It reads
the domain attachment kind instead of accepting arbitrary component names.

- DXF and SVG use `DrawingCanvas`; SVG is rendered as an image reference rather
  than injected markup.
- SKETCH drawings use `DrawingCanvas` with the `sketch` source type, which
  normalizes the scene JSON (background image + strokes) through
  `utils/sketch.js` into the shared layer contract — there is no separate
  sketch renderer.
- Images, PDF, DOCX, text, CSV, and XLSX have dedicated viewer modes.
- `ArtifactTextEditor.vue` owns the editable UTF-8 text and CSV save path.
- `SketchEditor.vue` owns the SKETCH editing surface: perfect-freehand pen
  plus line/rect/ellipse/eraser tools, undo/redo, an optional background
  image (uploaded to the `sketches` bucket, referenced from the scene JSON),
  and an optional origin entity reference persisted to
  `data.metadata.origin` through `PUT /api/artifacts/:id`. Scene data is
  plain JSON saved through the same file-replacement endpoint as the text
  editor, so revisions and access checks are identical.
- `ArtifactDetail` supplies artifact DTOs and revision DTOs; the viewer never
  receives unauthorised file URLs.

The CSV editor renders an editable cell table and persists a replacement file,
therefore creating a new immutable artifact file revision. XLSX is intentionally
read-only.
