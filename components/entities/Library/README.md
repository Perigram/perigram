# COMPONENT: Library Components

Cards for `library` DTOs from the `libraries` collection.

## Components

- `LibraryCard.vue` renders inline, compact, and card variants through shared
  `InstanceCard` chrome. It displays the library identity, material data, and the
  cassette count summary. When `summary.cassettePreview` is present, the card
  replaces that count with the shared compact cassette relation gallery so
  library children use the same preview/popover/overflow convention as
  generated entity cards.

## Contract

- Expects a v24 `library` DTO with `identity`, `lineage`, `origin`, `status`,
  `attachments`, `data`, and `summary`.
- Uses `data.material`, `data.description`, `summary.cassetteCount`, and
  `summary.cassettePreview`.
- Cassettes created with a library parent persist `lineage.libraryId`; summary
  sync treats those cassettes as children of the library.
- Trace links to libraries resolve through generated entity-detail screens when
  an active process grants the user a matching library detail surface. They
  must not route to `/assets/cassettes`, which is the child cassette manager
  surface.

## Related

- [components/shared/README.md](../../shared/README.md) - InstanceCard and DataBlock
- [server/features/libraries/README.md](../../../server/features/libraries/README.md) - backend feature contract
