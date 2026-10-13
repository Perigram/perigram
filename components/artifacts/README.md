# COMPONENT: Artifact Viewers

`ArtifactViewer.vue` is the fixed format registry for artifact files. It reads
the domain attachment kind instead of accepting component names.

- DXF and SVG use `DrawingCanvas`; SVG is rendered as an image reference rather
  than injected markup. Image-reference rendering requires the payload
  download endpoint to serve the stored file's real content type
  (`image/svg+xml`) — browsers refuse SVG images on sniffed or
  octet-stream responses (see the payload preview contract in
  [components/generated/README.md](../generated/README.md)).
- SKETCH drawings use `DrawingCanvas` with the `sketch` source type, which
  normalizes the scene JSON (background image + strokes) through
  `utils/sketch.js` into the shared layer contract — there is no separate
  sketch renderer.
- Images, PDF, DOCX, text, CSV, and XLSX have dedicated viewer modes.
- Previews never scroll: the viewer container is bounded and
  overflow-hidden. Geometry canvases fit (the pane viewer keeps pan/zoom
  interaction), PDF/DOCX keep their document-native surfaces (an embedded
  frame and a white document host), tables page through the shared
  `TABLE_PAGE_ROWS` budget with a paginator, and long text clamps. The
  `card` variant fills its caller's fixed-height band with no own border
  (the host card owns the chrome): images cover it at uniform scale,
  sketch scenes fill it (slice), vector drawings (dxf/svg/occs) fit
  inside it (meet), and cassette dimension text renders big there while
  the pane viewer keeps the pixel-matched base size.
- Text previews render in the app's serif prose voice. Markdown documents
  (`text/markdown` mime or a `.md` filename) render as sanitized HTML
  through `marked` + `DOMPurify`; plain text keeps its line breaks.
- `ArtifactTextEditor.vue` owns the editable text and CSV save path. Text
  documents are markdown, and the editor edits the markdown source
  directly — the payload IS the text, so nothing converts on load or
  save (no HTML proxy losing whatever a rich-text model cannot carry).
  The source surface is a PrimeVue `Textarea` in the technical mono
  voice (`text-technical`, form chrome stripped through pt — it is the
  document, not a form control); the preview toggle renders the same
  `marked` + `DOMPurify` pipeline the read-side viewer uses, in the
  prose voice. The document chrome is one toolbar row shared with the
  csv surface: the name edits in place as quiet document text (pt-stripped
  InputText, focus ring as the edit affordance), committed through
  enter, the apply control that appears while the draft differs, or
  blur — all through the persistence `rename` seam — beside the preview
  toggle and save. Quill is gone from the app entirely: the PrimeVue
  `Editor` component, the `quill.snow.css` import, the editor component
  tokens, and the main.css quill block were all deleted with the
  rich-text surface. The persistence adapter carries the file
  `extension` (`.md` for instance documents, `.txt` or `.md` following
  the stored file for artifacts) and the save mime. Text artifacts
  upload as `.txt` or `.md` (`text/plain` or `text/markdown`); markdown
  keeps its kind on save, and `text-document` instances accept `.md`
  uploads through the type's `upload` creation protocol
  ([documents pack](../../../packages/documents/README.md)). The editor
  is a document surface, not an edge-to-edge canvas: it owns its own
  pane padding, and its workspace pages register as `flush`, so the
  pane host renders them without its own padded scroll area — the
  source/preview grows into the pane and scrolls inside it, never the
  page.
- `SketchEditor.vue` owns the SKETCH editing surface: perfect-freehand pen
  plus line/rect/ellipse/eraser tools, undo/redo and the standard zoom
  cluster (both through `composables/useSnapshotHistory.js` and a
  center-zooming viewBox), rename through the persistence seam, an
  optional background
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
