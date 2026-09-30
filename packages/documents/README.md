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
| `text-document` | `text/markdown` (10 MB) | `text` | markdown by default — the rich text editor converts HTML ↔ markdown on save/load; `revisions: 'content'`; creation protocol `editor` |
| `csv-table` | `text/csv` (10 MB) | `table` | `revisions: 'content'`; creation protocol `editor` |
| `xlsx-workbook` | spreadsheet xlsx (25 MB) | `workbook` | first-sheet table preview |
| `docx-document` | wordprocessing docx (25 MB) | `download` | no bounded preview — the payload downloads |

Creation protocols project as construct `via` modes: `upload`/`capture`
add a typed `file` input (accept/capture attrs) to the generated create
dialog; `editor` constructs a blank instance whose first editor save
fills the payload.

## The table-import surface

`xlsx-workbook` binds the `table-import` editor surface: opening a
workbook's detail opens the import mapper — the workbook's purpose is to
become typed instances, so the import IS the authoring act on that data.
The mapper parses the payload client-side (the same SheetJS read the
workbook preview uses), walks sheet/header-row/range, maps columns to the
target type's declared fields (identifier, field leaves, quantity), and
constructs through the instances batch transport
(`POST /api/instances/:type/batch` — the contract lives in
[server/features/instances/README.md](../../server/features/instances/README.md)),
with the workbook recorded as each row's provenance source. For
pack types with a bespoke construction mode the batch route runs that
mode's handler (`cassette-design` rows bake from a template ref plus
parameter columns — see
[packages/facade](../../packages/facade/README.md)). `csv-table` keeps
the csv editor (it edits in place); its import path rides the same batch
transport when needed.

## The rows projection

`csv-table` and `xlsx-workbook` declare the `rows` projection (SPEC §8
`p extract`, §16): a table instance → its first sheet as a list of
header-keyed row records. The first non-empty row is the header; every
following non-empty row becomes one record mapping each header (trimmed,
stringified) to its raw cell (numeric-looking cells stay strings — typing
is value-layer authoring downstream). Column semantics live entirely in
the graph that reads the rows (`value.recordField` paths are the authored
column selection); the projection carries none.

The declaration resolves through the pack-mounted handler
(`server/packs/documents/table-rows.js` binds
`documents.tableRows`): it loads the payload once and runs the same
SheetJS read for both payload kinds. The client import mapper's parse is
presentation (interactive sheet/header/range walking); the projection is
the data seam.

## Editor bindings

The pack binds the text and csv editors (`edit` mode) to their types; the
text editor is the PrimeVue `Editor`-based markdown surface, the csv
editor the shared cell table — both through `ArtifactTextEditor` with an
instance-backed persistence contract (saves through the revisioned
instance payload transport). Originating artifact kinds (`TEXT_FILE`,
`CSV_FILE`, `TEXT_DOCUMENT`, `CSV_TABLE`) keep their artifact editors
through the artifact-backed adapter until the artifact entity is retired.
