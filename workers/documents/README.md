# CONTAINER: Documents Plugin Executor

The Documents plugin owns office/media file formats, typed document values,
template engines, and editor/preview surfaces. The platform owns graph
authoring, execution policy, file authorization, and Bake/Export destinations.

- Listing: `listing.json` (v28). Its `documents-shared` runtime entry is
  `runtime/shared.mjs`; provider definitions are derived from the listing's
  service signatures, palette metadata, and execution declarations. There is
  no second hand-authored graph operation catalog.
- Browser graph runtime: the plugin Worker loads the pinned runtime assets.
  Pure document IR, Markdown parsing, Markdown/XLSX template fill, and
  file/table reads execute through this provider. File reads request the
  host's authorized `files.read` capability; the plugin receives bytes,
  never platform credentials.
- Server graph execution: the runtime declares browser/server targets, but
  the canonical server procedural graph evaluator is not yet wired. Do not
  interpret a `server` target declaration as proof that a saved graph can
  currently be executed on the server. This remains an explicit root
  [TODO](../../TODO.md) item.
- Endpoint services: seven operations remain in the platform-managed
  Documents executor for legacy projections and PDF/construction flows:
  `table-rows`, `table-cells`, `text`, `fill`, `render-pdf`,
  `render-report-pdf`, and `render-document-pdf`. Their executor origin is
  platform-managed; organizations do not configure their own endpoint.
- File lifecycle: graph file payloads use the generic `{ payload: { base64,
  mime, name } }` envelope. The host owns file identity, access checks,
  explicit destinations, and persistence through generic Bake/Export.

The plugin's `text-editor` and `csv-editor` surfaces remain package assets.
The graph preview surface renders document/report IR directly and renders
Markdown/HTML in a sanitized sandbox; XLSX outputs render as bounded
worksheet tables. The executor serves legacy endpoint operations and static
surface assets on port 8791.

### XLSX template graph operation

`fill-workbook-template` runs in the shared browser/server runtime and
accepts a typed `documents.file` workbook payload plus a record of values.
It preserves cell styles, row and column metadata, translates relative A1
row references when rows move, and expands one-level row sections. Repeated
rows receive their own merged ranges; ambiguous merges crossing a section
boundary are dropped rather than producing overlapping cells. Formula
recalculation is requested on workbook open. Connect `read-file` to this
operation and Bake its `documents.file` output through the generic
page-file destination. Theme fills, charts, images, shared/array formulas,
and external-workbook reference fidelity are not guaranteed.

### File-backed graph workflows

Graph interface inputs whose contract is `documents.file-id` use a readable
file-instance picker in the graph preview panel; users do not need to paste
opaque file IDs. The graph can connect that input to `read-file`, which
uses the authorized `files.read` capability and returns a
`documents.file` payload. That payload can feed `fill-workbook-template`
or another file-aware operation, then flow into the generic graph Bake
operation with an explicit destination page and path.

The shared XLSX filler translates relative A1 row references when rows move,
invalidates cached results for moved formulas, preserves row/column metadata,
and expands unambiguous merged ranges per repeated section instance. It
preserves cell styles and one-level row sections. Shared/array formulas,
external-workbook references, theme fills, charts, and images are not
guaranteed; merges crossing a repeat boundary are intentionally omitted.

### Graph file preview

The Documents preview channel accepts Markdown, HTML, and XLSX file payloads
from graph outputs and node outputs. Markdown/HTML render through the host
Markdown/DOMPurify pipeline in a sandboxed iframe with restrictive CSP;
XLSX renders the first worksheet as a bounded table. Document and report IR
previews remain native read-only renderings. The graph output panel selects
this channel for supported file values instead of exposing base64 JSON.

### Markdown template graph operation

`fill-markdown-template` is a pure operation in the shared runtime and
currently executes through the browser graph provider. It accepts template
text, a record of named values, and an optional output name; unresolved
placeholders remain visible. Its result is a real
`text/markdown` file payload and can flow directly into the generic Bake
path. File selection/read remains an explicit preceding `read-text-file`
operation using the authorized `files.read` capability.

### Markdown parsing in the shared provider

`parse-markdown` is a pure Documents operation in the
`documents-shared` runtime. The browser graph runtime uses the
`markdown-ir.mjs` adapter to turn Markdown into the typed
`text.flow-document@1` value; the endpoint-only parser path is retired.
The runtime declaration also names a server target, but the server
procedural graph evaluator is not yet wired.
Unsupported HTML and image constructs remain explicit diagnostics rather
than silently disappearing. The report adapter re-exports the same parser
for existing imports.

### HAG and graph template inputs

The legacy `fill` construction still exposes `meta.tokens` to the shared
HAG fill form, which renders one scalar input per discovered template token.
The graph operations currently accept an explicit `values` record input;
they do not yet introspect a connected template and turn its token list into
per-token authoring controls. Reuse the existing token extractors and HAG
form contract when adding that graph inspector experience. Do not create a
second template model or a second token grammar. Markdown/XLSX graph HAG
controls and PDF graph exposure remain open work in the root TODO.

### PDF graph operation status

PDF template filling and PDF rendering remain available through the
existing platform-managed Documents executor and the SPEC §24 construction
contract. They are not yet exposed as server-only procedural graph nodes:
that depends on the canonical managed server graph evaluator and an
explicit typed file/capability boundary. DOCX fill/export is not declared
as a supported template workflow.

### Unified graph provider scope

The `documents-shared` runtime publishes 27 browser graph operations:
CSV serialization; typed inline and block constructors; Markdown parsing;
document/report composition and append; HTML rendering; Markdown/HTML file
exports; Markdown/XLSX template fill; and authorized file, text, and table
reads. Definitions derive from the installed listing's signatures,
execution declarations, and palette metadata.

The seven endpoint-mode services are the legacy `text`/table projections,
construction `fill`, and PDF render/fill operations listed above. The
remaining work is not provider discovery: it is persisted graph-workspace
acceptance, managed server graph evaluation, PDF graph-node exposure, and
installed-catalog upgrade verification.

### Graph operation palette

Documents exposes semantic operation groups from its listing:

- **Document sources** — select an existing file and read its bytes or text
- **Table data** — extract header-keyed or positional rows and serialize rows to CSV
- **Inline content** — create text, emphasis, strong/code marks, and safe links
- **Document blocks** — create paragraphs, headings, lists, tables, quotes, code blocks, and dividers
- **Document composition** — parse Markdown, compose/append flowing documents, and compose sectioned reports
- **Document export** — render HTML and produce Markdown/HTML file payloads; PDF remains in the endpoint-backed construction path

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
plus `children`. Paragraphs and headings accept inline-value lists; list
blocks accept optional plain-text `items` or typed inline `inlineItems` (or
both), so a formatted-only list does not require an unused text-list input.
The provider validates nested inline and block values when constructing,
composing, appending, previewing, or exporting a document. Unsafe link
schemes are rejected or dropped with a parse diagnostic. Markdown export escapes literal text punctuation, selects safe code-span delimiters and link destinations, and escapes table cell delimiters while flattening embedded line breaks.

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
`{ payload: { base64, mime, name } }`. The graph host materializes Markdown (`text/markdown`),
HTML (`text/html`), and XLSX
(`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
payloads through generic Bake/Export. PDF uses `application/pdf` in the
existing endpoint-backed construction flow; a PDF graph operation is still
open work. The HTML type exposes a text projection and a plugin preview
that sanitizes through the host markdown pipeline, then renders in a sandboxed
iframe with scripts and network access disabled. The plugin defines the
format; the host owns file identity, authorization, destination, and
persistence. `Export Markdown`
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

- XLSX fills rewrite values in place and rebuild rows for repeated
  sections. Relative A1 row references shift with moved rows; absolute
  row references and quoted formula strings stay fixed, and moved formula cells are written without stale cached results so
  spreadsheet applications can recalculate them. Cell styles, row metadata,
  column metadata, and unambiguous merged ranges are carried forward. Merges
  crossing repeat boundaries are omitted. Theme fills, charts, images,
  shared/array formulas, and external-workbook formula fidelity may drop.
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

The graph preview channel renders Markdown/HTML in a sandboxed iframe and
XLSX as a worksheet table. The shared file payload envelope is accepted by
the generic page-file Bake path.
