# COMPONENT: @perigram/documents

The documents reference pack (SPEC §21): the generic document/media file
types as declarations — the payload-trait replacements for the artifact
kind registry's common kinds. Pure, browser-safe declaration data;
mounting is by composition — the pack appears in
[server/packs/declarations.js](../../server/packs/declarations.js) and
carries no service bindings.

## Types

All types are `file` class with a `name` row field and payload traits
whose `preview` modes match the shared viewer modules exactly (see the
preview contract in
[components/generated/README.md](../../components/generated/README.md)):

| Type | Payload | Preview | Notes |
|---|---|---|---|
| `image` | `image/jpeg`, `image/png` (25 MB) | `image` | the photo/capture document |
| `pdf-document` | `application/pdf` (25 MB) | `pdf` | |
| `text-document` | `text/plain` (10 MB) | `text` | `revisions: 'content'` — editor-replaceable through the `text-editor` surface |
| `csv-table` | `text/csv` (10 MB) | `table` | `revisions: 'content'` — editor-replaceable through the `csv-editor` surface |
| `svg-file` | `image/svg+xml` (10 MB) | `svg` | |
| `dxf-source` | `application/dxf` (50 MB) | `dxf` | the raw drawing exchange document |
| `xlsx-workbook` | spreadsheet xlsx (25 MB) | `workbook` | |
| `docx-document` | wordprocessing docx (25 MB) | `docx` | |

## Editor bindings

The pack binds the text and csv editors (`edit` mode) to their types;
the editors are the shared `ArtifactTextEditor` with an instance-backed
persistence contract (saves through the revisioned instance payload
transport). Originating artifact kinds (`TEXT_FILE`, `CSV_FILE`,
`TEXT_DOCUMENT`, `CSV_TABLE`) keep their artifact editors through the
artifact-backed adapter until the artifact entity is retired.
