# COMPONENT: Artifact Viewers

`ArtifactViewer.vue` is the shared file viewer. It has two mounts:

- CTS file instances (the primary mount): generated screens and panes
  resolve the type's preview policy and pass it as an explicit `source`
  `{ mode, fileUrl, attachment }` — the payload preview contract lives in
  [components/generated/README.md](../generated/README.md).
- Legacy artifact-entity rows: `ArtifactDetail` passes the artifact DTO
  and revision; the read surface is download/preview only. The artifact
  entity's editing paths are retired — file editors belong to the packs
  that own the types (`packages/<pack>/src/editors/`), and no artifact
  kind resolves an editor.

Viewer modes read the preview contract, not component names:

- DXF and SVG use `DrawingCanvas`; SVG is rendered as an image reference
  rather than injected markup. Image-reference rendering requires
  the payload download endpoint to serve the stored file's real content
  type (`image/svg+xml`) — browsers refuse SVG images on sniffed or
  octet-stream responses (see the payload preview contract in
  [components/generated/README.md](../generated/README.md)).
- SKETCH scenes use `DrawingCanvas` with the `sketch` source type, which
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
  (the `isMarkdownDocument` rule in
  [shared/markdown.js](../../shared/markdown.js): `text/markdown` mime or
  a `.md` filename) render through its `renderMarkdown` pipeline
  (`marked` + `DOMPurify`); plain text keeps its line breaks.
- `ArtifactDetail` supplies artifact DTOs and revision DTOs; the viewer never
  receives unauthorised file URLs.

The artifact kind registry (`shared/attachment-kinds.js`) is trimmed to
the contracts the live artifact flows still speak — the facade plugin's
DXF source uploads, its `generateAttachment` outputs (PDF passport,
nesting layouts), its artifact templates, and camera-capture uploads.
Everything else is a CTS file type with payload traits; legacy rows of
retired kinds resolve no kind and degrade to a download preview. The
full artifact-entity retirement (facade plugin included) is the tracked
payload-trait flip.
