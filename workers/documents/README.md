# CONTAINER: Documents Plugin Executor

The documents domain as a third-party plugin (SPEC §20): the generic
media/office file types (image, PDF, markdown, CSV, XLSX, DOCX), their
editor surfaces, the table projections, the CSV composition, and the
template fills (SPEC §24). The platform carries zero documents code:
projections and fills compute here as pure payload decompositions and
compositions, editors ship as the plugin's surface modules, and the
types ride the generic instance machinery from the install snapshot.

- Listing: `workers/documents/listing.json` — types with
  service-resolved projections (`resolve: { service:
  'plugin.documents.<svc>' }` — endpoint mode), the six services,
  editor bindings, the fill construction bindings, and the
  text-document starter construct (markdown stays visible-by-default
  through the default installs). `requires` names tech-drawing: the
  PDF render construction accepts `dxf-source` sources.
- Services (`services.js`, endpoint mode): `table-rows`/`table-cells`
  (payload → first sheet as header-keyed / positional row records),
  `text` (payload → string), `csv-text` (rows → CSV text, the wireable
  composition twin the process palette serves), `fill` (template ref
  payload + values → filled file payload, dispatched on the template
  kind), and `render-pdf` (source ref payload → rendered PDF payload,
  dispatched on the source kind).
- Editor surfaces (contract 3 — the capability mount): the markdown
  editor (`surfaces/text-editor.mjs`, milkdown/crepe with every engine
  chrome disabled — remote saves reconcile through the host's
  record-change bridge) and the csv editor (`surfaces/csv-editor.mjs`,
  cell-edit DataTable). The read-only presentations (mount
  `mode: 'read'`, SPEC §4): the markdown editor renders the document
  itself; the csv editor renders the table and the document name. Mermaid fences preview as diagrams in the
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
