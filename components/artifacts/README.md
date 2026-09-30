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
  documents are markdown by default: the editing surface is the PrimeVue
  `Editor` (Quill) rich text control whose HTML converts to markdown on
  save (`turndown`) and from markdown on load (`marked`). Quill's bundled
  themes hardcode a Helvetica 13px document voice, so the host applies
  the app's `editor` typography role (serif, one size above prose) and
  re-imposes it on the editor internals through inline pt styles (the
  repo's cascade discipline: no scoped typography CSS); the toolbar
  keeps the UI font. The editor
  toolbar is restricted to formats markdown can round-trip. The
  persistence adapter carries the file `extension` (`.md` for instance
  documents, `.txt` for legacy plain-text artifacts) and the save mime.
  The editor is a document surface, not a flush canvas editor: it owns
  its own pane padding, and its document chrome is one `ActionToolbar`
  row — display name, rename (through the persistence `rename` seam),
  save — matching the shared designer document contract.
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
