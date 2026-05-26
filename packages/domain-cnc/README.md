# COMPONENT: @cutkit/domain-cnc

CNC domain implementation package. It owns manufacturing vocabulary and
contracts, but imports no Vue, Nuxt, MongoDB, or worker implementation code.

## Modules

- `entities.js` - CNC entity definitions.
- `workflows.js` - entity lifecycle machines and transition hooks.
- `commands.js` - business intent contracts: `saveCassetteTemplate`,
  `solveNesting`, `generateAttachment`.
- `tasks.js` - async task contracts: DXF parsing, cassette baking, nesting
  solve, attachment generation.
- `attachment-kinds.js` - file/blob kinds, buckets, MIME types, preview modes.
- `hooks.js` - typed transition hook parameter contracts.
- `summaries.js` - aggregate summary contracts and frontend route metadata.
- `ui.js` - design-system policy metadata, not Vue components.
- `index.js` - public exports and aggregate `cncDomain`.

## Vocabulary

Commands are the access/business intent boundary. Tasks are retryable async
execution. Attachments are persisted entity-linked file records; attachment
kinds declare how a file should be stored and previewed.

The `solveNesting` command and `nesting.solve` task produce `nesting_run` and
`sheet_design` entities only. DXF/SVG/PDF files are requested later through the
artifacts service and `AttachmentKind` contracts, not as primary nesting-run
outputs.

`artifact` remains the current persisted entity type for generated file records.
File behavior is declared by `AttachmentKind`.

## UI Boundary

This package may declare UI policy: entity surface keys, status visibility,
icons, docs, component paths, and field paths. It must not import Vue components.
`@cutkit/vue` turns this metadata into frontend lookup helpers.

## Related

- [@cutkit/core](../core/README.md)
- [Runtime registry](../../server/runtime/README.md)
