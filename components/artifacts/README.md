# COMPONENT: Artifact Viewers

`ArtifactViewer.vue` is the shared file viewer. Both live mounts —
`shared/InstancePreviewMedia.vue` and `ui-mapping/PreviewBox.vue` — pass an
explicit `source` `{ mode, fileUrl, attachment }` resolved from the type's
compiled preview policy (the payload preview contract lives in
[components/generated/README.md](../generated/README.md)).

Viewer modes follow the preview contract:

- DXF and SVG use `DrawingCanvas`; SVG renders as an image reference.
  Image-reference rendering requires the payload download endpoint to
  serve the stored file's real content type (`image/svg+xml`) — browsers
  refuse SVG images on sniffed or octet-stream responses (see the payload
  preview contract in
  [components/generated/README.md](../generated/README.md)).
- SKETCH scenes use `DrawingCanvas` with the `sketch` source type, which
  normalizes the scene JSON (background image + strokes) through
  `utils/sketch.js` into the shared layer contract.
- Images, PDF, DOCX, text, CSV, and XLSX have dedicated viewer modes.
- Previews stay bounded: the viewer container is overflow-hidden.
  Geometry canvases fit (the pane viewer keeps pan/zoom interaction),
  PDF/DOCX keep their document-native surfaces (an embedded frame and a
  white document host), tables page through the shared `TABLE_PAGE_ROWS`
  budget with a paginator, and long text clamps. The `card` variant fills
  its caller's fixed-height band with the host card owning the chrome:
  images cover it at uniform scale, sketch scenes fill it (slice), vector
  drawings (dxf/svg/occs) fit inside it (meet), and cassette dimension
  text renders big there while the pane viewer keeps the pixel-matched
  base size.
- Text previews render in the app's serif prose voice. Markdown documents
  (the `isMarkdownDocument` rule in
  [shared/markdown.js](../../shared/markdown.js): `text/markdown` mime or
  a `.md` filename) render through its `renderMarkdown` pipeline
  (`marked` + `DOMPurify`); plain text keeps its line breaks.

The artifact kind registry (`shared/attachment-kinds.js`) carries the
facade plugin's flows: DXF source uploads, `generateAttachment` outputs
(PDF passport, nesting layouts), artifact templates, and camera-capture
uploads. Stored rows that resolve no kind degrade to a download preview;
file types with payload traits render through the CTS preview contract
above.
