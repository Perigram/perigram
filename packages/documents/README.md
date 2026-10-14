# COMPONENT: @perigram/documents

The documents reference pack (SPEC §21): the generic media/office file
types as declarations — the payload-trait replacements for the artifact
kind registry's common kinds. Browser-safe declaration data; mounting is
by composition in
[server/packs/declarations.js](../../server/packs/declarations.js), and
the pack's one server binding is the `rows` projection handler (below).
Drawing/CAD formats (DXF, SVG) are NOT
here — they are tech-drawing vocabulary
([@perigram/tech-drawing](../tech-drawing/README.md)).

## Types

All types are `file` class with a `name` row field and payload traits
whose `preview` modes match the shared viewer modules exactly (see the
preview contract in
[components/generated/README.md](../../components/generated/README.md)):

| Type | Payload | Preview | Notes |
|---|---|---|---|
| `image` | `image/jpeg`, `image/png` (25 MB) | `image` | creation protocols `upload` + `capture` (mobile camera) |
| `pdf-document` | `application/pdf` (25 MB) | `pdf` | |
| `text-document` | `text/markdown` (10 MB) | `text` | markdown — the editor edits the source directly with a rendered preview; `revisions: 'content'`; creation protocols `editor` + `content` + `upload` (bring an existing `.md` in) |
| `csv-table` | `text/csv` (10 MB) | `table` | `revisions: 'content'`; creation protocols `editor` + `content` |
| `xlsx-workbook` | spreadsheet xlsx (25 MB) | `workbook` | creation protocol `upload`; no bespoke editor — the workbook's authoring act is being read by graphs (`rows` projection) |
| `docx-document` | wordprocessing docx (25 MB) | `download` | no bounded preview — the payload downloads |

Creation protocols project as construct `via` modes: `upload`/`capture`
add a typed `file` input (accept/capture attrs) to the generated create
dialog; `editor` constructs a blank instance whose first editor save
fills the payload; `content` (SPEC §4, owner decision 2026-10-13) adds a
`content` string input — the wired or prompted text becomes the payload at
construct, so graphs create documents from composed values and generated
dialogs prompt a textarea.

## Table decomposition: the `rows` and `cells` projections

`csv-table` and `xlsx-workbook` declare two extract projections (SPEC §8
`p extract`, §16) — the author picks the one that matches the file:

- **`rows`** — a table instance → its first sheet as a list of
  header-keyed row records. The first non-empty row is the header; every
  following non-empty row becomes one record mapping each header (trimmed,
  stringified) to its raw cell as SheetJS parsed it (numeric-looking cells
  arrive as numbers — casting and formatting are value-layer authoring
  downstream: `value.cast`, `value.format`).
- **`cells`** — the positional twin for sheets without column names: every
  non-empty row is data (the first row included), and keys are spreadsheet
  column letters (`A`, `B`, … `AA`), so `value.recordField` path `A` is the
  positional column read.

Both carry the output type `list<record>`; column semantics live entirely
in the graph that reads them (`value.recordField` paths are the authored
column selection); the projections carry none. The `tableData` palette
group surfaces one item per operation — Table rows, Table cells, Text —
never per-type copies: the dropped node keeps the projection preset and
binds its type at configure time, the inspector's projection switch the
single mode selector. The tab is the vocabulary home for spreadsheet
data operations, and nothing table-specific may land in the core value
groups.

Both resolve through pack-mounted handlers in
`server/packs/documents/table-rows.js` (`documents.tableRows` /
`documents.tableCells`): one payload load and the same SheetJS read for
both payload kinds, then the header-keyed or positional conversion. The
workbook preview renders from the same parse shape; the projections are
the one data seam.

## The text projection

`text-document` declares the `text` projection: payload → its markdown
as one string (the entity→value gate for text payloads — a template
document enters the graph, `value.format` fills its `{key}` placeholders
from a record, and a `content`-mode construct writes the filled document
back). It rides the same `tableData` tab and the same pack loader
(`documents.text` in `server/packs/documents/table-rows.js`).

Rows downstream: the projection's output type is `list<record>` — plain
header-keyed row records, every cell the value SheetJS parsed — and at
runtime that value travels the packet tree like any list (branches/items;
every palette node is list-aware through it). The reading graph works the
rows with the core vocabulary: `value.recordField` picks columns,
`collection.joinByKey` joins row streams, the list/tree algebra
filters/reshapes, `control.forEach` runs per-row effects, and
`record.construct` + `cts.construct` create instances from row data (the
composed order process in [e2e/order-process.spec.js](../../e2e/order-process.spec.js)
is the live proof). One cell reads column-first — `value.recordField`
over the rows, then `collection.itemAt` on the column list — because
`itemAt` on the rows returns the row record itself, which a `recordField`
accepts as a one-item broadcast. Nothing table-specific lives in the core
groups.

## The csvText service

`documents.csvText` (SPEC §8 s species) is the composition twin of the
`rows` decomposition: `list<record>` → CSV text. Header order is
first-seen across the rows; cells quote on `"`/`,`/newlines (RFC 4180,
CRLF rows), and missing cells serialize empty — the output round-trips
through the `rows` projection. It drops pre-bound in the `tableData` tab
beside the extract presets; its pure serializer lives in
`server/packs/documents/value-services/csv-text.js` and its command
(`documents.csvText`) is declared once in this package and bound to the
handler in the pack mount. Pair it with the `content` creation protocol
on `csv-table` to write tables from procedural data; workbooks stay
read-only.

## Editor bindings

The pack binds the text and csv editors (`edit` mode) to their types —
and the editor surfaces are the pack's own components
(`src/editors/TextDocumentEditor.vue` and `src/editors/CsvTableEditor.vue`):
editor surfaces belong to the pack that owns the type, the app-side
file-surface registry is only the mount table. The text editor is a
single-surface live markdown editor (milkdown crepe, owner direction
2026-10-15: the Obsidian model — the document renders in place while
writing, the focused block shows its markdown source; the editor's
model IS markdown, serialization is the framework's own, no rich-text
proxy). The
csv editor edits rows in a cell table and serializes CSV text on save
(PrimeVue's cell editor commits through `cell-edit-complete`). Both take
the instance-backed persistence contract (loads through the payload
download URL, saves through the revisioned instance payload transport —
the contract home is
[components/generated/README.md](../../components/generated/README.md)).

## Starter constructs

`starterConstructs` declares what the pack stations into every
organization's initial process (SPEC §UI visible-by-default): the
text-document editor construct, manually triggered and granted to the
org's admin role, so markdown creation is visible for every new
organization. The composition home is `composeStarterConstructs`
([server/packs/README.md](../../server/packs/README.md)); existing
organizations are repaired by
`server/scripts/station-documents-types.js`.
