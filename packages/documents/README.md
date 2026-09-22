# COMPONENT: @perigram/documents

The documents reference pack (SPEC §21): the generic media/office file
types as declarations — the payload-trait replacements for the artifact
kind registry's common kinds. Pure, browser-safe declaration data;
mounting is by composition — the pack appears in
[server/packs/declarations.js](../../server/packs/declarations.js) and
carries no service bindings. Drawing/CAD formats (DXF, SVG) are NOT
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

## Editor bindings

The pack binds the text and csv editors (`edit` mode) to their types; the
text editor is the PrimeVue `Editor`-based markdown surface, the csv
editor the shared cell table — both through `ArtifactTextEditor` with an
instance-backed persistence contract (saves through the revisioned
instance payload transport). Originating artifact kinds (`TEXT_FILE`,
`CSV_FILE`, `TEXT_DOCUMENT`, `CSV_TABLE`) keep their artifact editors
through the artifact-backed adapter until the artifact entity is retired.
