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
  save (`turndown`) and from markdown on load (`marked`). The document
  chrome is one toolbar: the name edits in place in the toolbar itself
  as quiet document text — the InputText strips its form-field fill and
  border through pt (transparent, focus ring as the edit affordance) —
  committed through enter, the apply control that appears beside the
  field while the draft differs, or blur — all through the persistence
  `rename` seam), save sits beside it, and the format controls follow in
  the editor's own toolbar slot, restricted to
  formats markdown can round-trip. The csv surface shares the same
  name/save row. Quill never loads its own stylesheet beside the
  component: the PrimeVue editor theme already embeds the snow base with
  token-driven overrides inside the `primevue` cascade layer, and an
  unlayered `quill.snow.css` import stacks hardcoded values (#ccc
  borders) over that layer, which can never win — that import is the
  white-borders defect, do not reintroduce it. The editor rides the
  zero canvas: surfaces are transparent through the `editor` tokens in
  `assets/tokens/index.js` (no form-field fill on the toolbar or the
  editable — the pane Panel hairline is the box), and the component's
  inline pt styles carry the app's document voice and layout (serif
  `editor` role inherited into the content, no box borders, one chrome
  hairline under the toolbar); child internals pt cannot reach (the
  editable's line-height and inset, blockquote/code marks, the link
  tooltip) are re-homed in the unlayered quill block in
  `assets/css/main.css`. App buttons placed in the toolbar slot carry a
  pt re-assertion (`toolbarButtonPt`): snow's embedded `button` rule
  (28×24, backgroundless) outranks `.p-button` inside the theme layer
  and would render them as invisible shells, so save/apply ride the
  text recipe with an explicit control box. The persistence adapter carries the file
  `extension` (`.md` for instance documents, `.txt` or `.md` following
  the stored file for artifacts) and the save mime. Text artifacts
  upload as `.txt` or `.md` (`text/plain` or `text/markdown`); markdown
  keeps its kind on save. The editor is a document surface, not an
  edge-to-edge canvas: it owns its own pane padding, and its workspace
  pages register as `flush`, so the pane host renders them without its
  own padded scroll area — the editor root grows into the pane and long
  documents scroll inside the editor content, never the page.
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
