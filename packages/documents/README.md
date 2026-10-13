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
| `text-document` | `text/markdown` (10 MB) | `text` | markdown — the rich text editor converts HTML ↔ markdown on save/load; `revisions: 'content'`; creation protocols `editor` + `content` |
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

## The rows projection

`csv-table` and `xlsx-workbook` declare the `rows` projection (SPEC §8
`p extract`, §16): a table instance → its first sheet as a list of
header-keyed row records. The first non-empty row is the header; every
following non-empty row becomes one record mapping each header (trimmed,
stringified) to its raw cell (numeric-looking cells stay strings — typing
is value-layer authoring downstream). Column semantics live entirely in
the graph that reads the rows (`value.recordField` paths are the authored
column selection); the projection carries none. The declaration carries
the `tableData` palette group: the pack's plugin tab in the process
designer, where table decomposition (and, when declared, composition and
management) drop pre-bound — the tab is the vocabulary home for
spreadsheet data operations, and nothing table-specific may land in the
core value groups.

The declaration resolves through the pack-mounted handler
(`server/packs/documents/table-rows.js` binds
`documents.tableRows`): it loads the payload once and runs the same
SheetJS read for both payload kinds. The workbook preview renders from
the same parse shape; the projection is the one data seam.

Rows downstream: the projection's output type is `list<record>` — plain
header-keyed row records, every cell a string — and at runtime that value
travels the packet tree like any list (branches/items; every palette node
is list-aware through it). The reading graph works the rows with the core
vocabulary: `value.recordField` picks columns, `collection.joinByKey`
joins row streams, the list/tree algebra filters/reshapes,
`control.forEach` runs per-row effects, and `record.construct` +
`cts.construct` create instances from row data (the composed order
process in [e2e/order-process.spec.js](../../e2e/order-process.spec.js)
is the live proof). Nothing table-specific lives in the core groups.

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

The pack binds the text and csv editors (`edit` mode) to their types; the
text editor is the PrimeVue `Editor`-based markdown surface, the csv
editor the shared cell table — both through `ArtifactTextEditor` with an
instance-backed persistence contract (saves through the revisioned
instance payload transport). Originating artifact kinds (`TEXT_FILE`,
`CSV_FILE`, `TEXT_DOCUMENT`, `CSV_TABLE`) keep their artifact editors
through the artifact-backed adapter until the artifact entity is retired.
