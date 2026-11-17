# CONTAINER: Documents Plugin Executor

The documents domain as a third-party plugin (SPEC §20): the generic
media/office file types (image, PDF, markdown, CSV, XLSX, DOCX), their
editor surfaces, the table projections, the CSV serialization, and the
template fills (SPEC §24). The platform carries zero documents code: the plugin owns the file formats,
projections, template fills, and rendering. Payload projections and file
constructions use endpoint handlers; pure CSV and document graph operations
run through one portable runtime on both browser and server. Editors ship as
the plugin's surface modules, and types ride the generic instance machinery.

- Listing: `workers/documents/listing.json` — types with
  service-resolved projections (`resolve: { service:
  'plugin.documents.<svc>' }` — synchronous provider dispatch), the service declarations,
  editor bindings, the fill construction bindings, and the
  text-document starter construct (markdown stays visible-by-default
  through the default installs). `requires` names tech-drawing: the
  PDF render construction accepts `dxf-source` sources.
- Services (`services.js`): pure CSV and document IR operations execute
  through `/runtime/shared.mjs` on both browser and server. Payload projections,
  Markdown parsing, template filling, and binary PDF generation remain
  endpoint handlers; projection helpers are synchronous provider dispatches,
  not palette items. The declared projections are the graph read nodes:
  `table-rows`/`table-cells` (payload → header-keyed / positional row
  records), `text` (payload → string), and `csv-text` (rows → CSV text).
  The extraction trio takes one `payload` field declared `blob`: composed
  on the process canvas the host hydrates the payload handle with its bytes
  (`payloadBase64`), projected the host sends the instance envelope
  (`{ typeId, payloadBase64 }`), and one normalizer serves both. `fill`
  (template ref payload + values → filled file payload) and `render-pdf`
  (source ref payload → PDF payload) remain construction/conversion bindings.

- Document and report operations (`report.js` and `report-ir.mjs`, grouped by inline content, blocks, composition, and export): `parse-markdown` (text → `text.flow-document@1`), typed inline and block constructors (`text.inline` and `text.document-block`), `compose-document` and `append-document-block` (blocks → flowing document), `export-markdown` (flow document → markdown text), Markdown/HTML file exports, and `render-document-html` (flow document → safe HTML). The `document.report@1` composition remains available for explicitly sectioned reports. The Documents preview channel renders flowing documents directly as well as report values; the IR is the source and Markdown, HTML, and PDF are representations.

### Graph operation palette

Documents exposes semantic operation groups from its listing:

- **Document sources** — read text from an existing Markdown file
- **Table data** — extract header-keyed or positional rows and serialize rows to CSV
- **Inline content** — create text, emphasis, strong/code marks, and safe links
- **Document blocks** — create paragraphs, headings, lists, tables, quotes, code blocks, and dividers
- **Document composition** — parse Markdown, compose/append flowing documents, and compose sectioned reports
- **Document export** — render HTML/PDF and produce Markdown/HTML file payloads

### Document graph values

The generic authoring value is `text.flow-document@1`:

```js
{
  type: 'text.flow-document',
  schemaVersion: 1,
  title?: string,
  blocks: DocumentBlock[],
  diagnostics?: string[]
}
```

A block is a typed `text.document-block` value. The union is:

| Block | Shape |
|---|---|
| Paragraph | `{ type: 'paragraph', children: InlineNode[] }` |
| Heading | `{ type: 'heading', level: 1..6, children: InlineNode[] }` |
| List | `{ type: 'list', ordered: boolean, items: InlineNode[][] }` |
| Quote | `{ type: 'blockquote', blocks: DocumentBlock[] }` |
| Code block | `{ type: 'code-block', language?: string, text: string }` |
| Table | `{ type: 'table', rows: Record<string, string>[] }` |
| Divider | `{ type: 'horizontal-rule' }` |

Inline values use kind `text.inline`: text/code nodes carry `text`, strong
and emphasis nodes carry `children`, and link nodes carry a safe `href`
plus `children`. The provider validates nested inline and block values when
constructing, composing, appending, previewing, or exporting a document.
Unsafe link schemes are rejected or dropped with a parse diagnostic.

A document can be authored entirely from nodes: create typed inline values
and blocks, put block outputs into `Make List` configured for
`text.document-block`, then connect that list to `Compose document`.
Alternatively append blocks one at a time. Existing Markdown files enter
through the `Parse Markdown` operation and produce the same value.

A concrete data workflow is: read a CSV/XLSX `rows` projection →
`Table` block → typed `Make List` → `Compose document` → preview →
`Export Markdown file` → Bake as a `text-document` instance. The row
projection connects directly to the table block's list input; block and
document sockets carry distinct semantic kinds, so arbitrary JSON records
cannot be wired in accidentally.

The sectioned `document.report@1` value remains available for report-specific
workflows; it is not a substitute for the generic authorable document value.

### File export and templates

File-producing operations return the plugin SDK payload envelope
`{ payload: { base64, mime, name } }`. The graph host materializes those
bytes through the normal Bake/Export lifecycle: Markdown uses
`text/markdown`, HTML uses `text/html`, and PDF uses
`application/pdf`. The plugin defines the format; the host owns file
identity, authorization, destination, and persistence. `Export Markdown`
also remains available as a plain string value when downstream graph
computation needs text rather than a file.

A graph-authored document becomes a reusable Markdown template through
`Compose document` → `Export Markdown file` → explicit Bake to a new
`text-document` instance. That ordinary file can then be selected as the
template input of the `text-document.fill` construction. No parallel
template record or document-specific storage path is introduced.

- Editor surfaces (contract 3 — the capability mount): the markdown
  editor (`surfaces/text-editor.mjs`, milkdown/crepe with every engine
  chrome disabled — remote saves reconcile through the host's
  record-change bridge) and the csv editor (`surfaces/csv-editor.mjs`,
  cell-edit DataTable). The read-only presentations (mount
  `mode: 'read'`, SPEC §4): the markdown editor renders the document
  itself; the csv editor renders the table. The editors carry no
  document chrome (owner direction 2026-11-07): the host's unified page
  header owns the document name and save through the `pageChrome`
  binding (`{ name, dirty, saving, diverged, save, rename, reload }` —
  the header renders the in-place name edit, the dirty-marked save, and
  the divergence refresh), and the link address popover anchors to the
  editing surface. Block authoring rides the slash panel — typing `/` at
  a word start
  offers the block vocabulary with glyphs and keyboard navigation:

  | Entry | Applies |
  |---|---|
  | Paragraph, Heading 1–6 | body text, heading level; the entry matching the focused block's kind returns the block to body text |
  | Bullet, Numbered, To-do list | gfm lists; to-do sets the checkbox attr on the focused list item |
  | Quote | blockquote; the quote entry on a quoted block lifts it out |
  | Callout | an empty blockquote the author fills in immediately; the pipeline renders blockquotes natively |
  | Code block, Diagram | fenced code (language picker on hover, CodeMirror); diagram seeds a `mermaid` fence |
  | Image | the host image chooser (stored upload or address); the source applies at the caret |
  | File | the host file chooser (stored upload or address); the pick becomes the shared file chip |
  | Divider, Table | horizontal rule; a three-by-three gfm table |
  | Link | the host address popover, anchored to the surface; the link applies at the caret |
  | Instance | the host instance tree (`@` and the entry share it); the pick inserts an atomic chip serialized as an inline `#instance:<type>/<id>` link |
  | Collection view | the host picker browses the shared instance tree to the parent record, then lists the record's child collections with their saved views; the pick inserts a `view` block carrying the collection ref (`{ typeId, name, parentTypeId, parentId, sourceId }`) or a saved lens ref (`{ id, typeId, name, parentTypeId, parentId, sourceId }`) beside the text blocks, and the host mounts `ViewEmbed` |

  Inline marks (bold, italic, inline code) author through input rules.
  The entry table lives in `surfaces/lib/block-vocabulary-data.mjs`; the
  action adapter beside it in `surfaces/lib/block-vocabulary.mjs` binds
  the entries to an engine instance. The table is the one grammar every
  markdown authoring surface mounts: this plugin's text editor over its
  served engine, the app's custom-page surface, and the instance
  overlay's text blocks and gutter insert menu
  ([components/generated](../../components/generated/README.md)) over
  the app's own crepe instance. The view entry hands off to the host's
  picker (`openViewPicker`); the image and link entries hand off to the
  host's address editor. Hosts without live embeds leave the view entry
  out of their slash panel. The page-link and AI-block entries join the
  table as their phases land.
  Mermaid fences preview as diagrams in the
  markdown editor through the host-provided `renderMarkdown` (the
  single pele home): blocks open diagram-only, crepe's Edit toggle or a
  click on the diagram flips to the CodeMirror source with the diagram
  kept live beside it, and fences that do not parse stay plain source
  blocks. The milkdown/codemirror families and xlsx are declared
  vendored dependencies — the split vendor build keeps one prosemirror
  class identity across the subpath bundles; rebuild with
  `perigram-plugin vendor --listing listing.json`. The crepe theme and
  the editor voice css are static assets under `assets/`, injected as
  links relative to the module URL. The theme css is built by the fence
  below — crepe's own theme files @import bare npm paths
  (`@milkdown/kit/...`) that no browser can resolve, so the served css
  is one esbuild bundle over the enabled features (Latex/AI/toolbar
  chrome stays off, keeping KaTeX's fonts out):

  ```
  C=node_modules/@milkdown/crepe/lib/theme/common
  printf '@import "%s/prosemirror.css";\n@import "%s/reset.css";\n@import "%s/table.css";\n@import "%s/code-mirror.css";\n@import "%s/list-item.css";\n@import "%s/image-block.css";\n' $C $C $C $C $C $C > /tmp/crepe-entry.css
  npx esbuild --bundle /tmp/crepe-entry.css --outfile=assets/vendor/crepe-theme.css
  ```

Runs from the repo mount (compose `documents-executor`, port 8791) —
nothing here imports platform code.

Every payload-bearing type declares the `content` revision scope: the
revisioned payload channel serves replace-in-place and construction-time
revision pinning for every file the plugin serves.

## Template fills (SPEC §24)

The `fill` and `render-pdf` services are bound by the listing's
`constructions`: `text-document`/`xlsx-workbook`/`pdf-document` gain a
`fill` mode, `pdf-document` gains a `render` mode (its `source` input
carries the authored `Source` label). The construction dispatch sends
`{ refs, draft: { data } }`; the service returns
`payload: { base64, mime, name }` (the executor payload
contract, [plugin-sdk](../../packages/plugin-sdk/README.md)) and the
platform stores it as the created instance's payload. The composed
file's name is the operator's typed create name (`draft.data.name`, a
declared input) over the source file's own name.

Token law:

| Token | Where | Substitution |
|---|---|---|
| `{key}` | markdown cells and text, xlsx cells, PDF text runs, renderable markdown | `values[key]`; a missing key keeps the placeholder |
| `{#key}` / `{/key}` | xlsx, one cell each, on their own rows | the rows between repeat once per element of `values[key]`; element fields shadow outer values; a scalar element binds to `{item}`; one nesting level |
| `{spot:name}` | DXF templates | the [tech-drawing](../tech-drawing/README.md) placement contract |

A concrete composition path is: read a CSV/XLSX `rows` projection →
`Table` block → `Make List` configured for `text.document-block` →
`Compose document` → preview → `Export Markdown file` → Bake as a
`text-document` instance. The projection's row records connect directly to
the table block's list input; block and document sockets carry distinct
semantic kinds, so arbitrary JSON records cannot be wired in by accident.

A graph-authored document becomes a reusable Markdown template through
`compose-document` → `export-markdown-file` → explicit Bake to a new
`text-document` instance. The resulting ordinary file can be selected as
the template input of the `text-document.fill` construction; no parallel
template record or document-specific storage path is introduced.

The `fill` service answers the template's token keys beside the payload
(`meta.tokens`, the ephemeral channel the preview passes verbatim) — the
fill dialog renders one scalar input per token.

Behavior and traps:

- xlsx fills rewrite values in place and rebuild rows for repeated
  sections; formulas (`f`) are left untouched. SheetJS community
  round-trips values, number formats, and column/row sizes — theme
  fills, charts, and images may drop.
- PDF template fill masks each token's text run with a white rectangle
  and redraws the substituted text in PT Sans at the same baseline; the
  masked original stays in the content stream (extractable text, hidden
  visually).
- `render-pdf` lays out markdown (headings, paragraphs, lists, pipe
  tables, code fences), workbook/CSV sheets as gridded tables (first
  sheet, 2000-row cap), DXF drawings (LINE/LWPOLYLINE/POLYLINE/CIRCLE/
  ARC/TEXT/MTEXT fit onto landscape A4), and images (centered A4).
- All PDF text embeds PT Sans Regular/Bold (`assets/fonts/`, SIL OFL 1.1)
  through fontkit — StandardFonts cannot encode Cyrillic.

## Publish, install, migrate

- Deploy + seed: `node server/scripts/seed-plugin-catalog.js`;
  organizations install explicitly from the Plugins section.
- Existing orgs: `server/scripts/migrate-documents-pack-to-plugin.js`
  rewrites `documents.csvText` service nodes to
  `plugin.documents.csv-text` (type ids unchanged). Restart the app
  after — per-org declaration caches rebuild on boot.
- Upgrades apply through the
  [plugins feature](../../server/features/plugins/README.md)
  (diff preview plus migration steps).

Parent: [workers README](../README.md). Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
