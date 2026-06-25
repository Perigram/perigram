# COMPONENT: Library Components

Cards for `library` DTOs from the `libraries` collection.

## Components

- `LibraryCard.vue` renders inline, compact, and card variants through shared
  `EntityCard` chrome. It displays the library identity, material data, and the
  cassette count summary.

## Contract

- Expects a v24 `library` DTO with `identity`, `lineage`, `origin`, `status`,
  `attachments`, `data`, and `summary`.
- Uses `data.material`, `data.description`, and `summary.cassetteCount`.
- Cassettes created with a library parent persist `lineage.libraryId`; summary
  sync treats those cassettes as children of the library.

## Related

- [components/shared/README.md](../../shared/README.md) - EntityCard and DataBlock
- [server/features/libraries/README.md](../../../server/features/libraries/README.md) - backend feature contract
