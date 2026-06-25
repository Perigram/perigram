# COMPONENT: Libraries

Manages cassette libraries. A library is an organization-scoped container for
reusable cassette templates that share material context.

## Core Files

- `model.js`: v24 `Library` entity wrapper.
- `repository.js`: MongoDB access for the `libraries` collection.
- `service.js`: creation, listing, update, delete, and access checks.
- `index.js`: public feature export.

## Data Structure

- `identity`: library name and slug.
- `lineage.organizationId`: owning organization.
- `data.material`: material descriptor or material reference payload.
- `data.description`: optional operator-facing description.
- `summary.cassetteCount`: aggregate count of `cassette` children with matching
  `lineage.libraryId`.

## Relation Contract

Libraries accumulate cassettes through lineage. A process `createEntity` action
that creates a `cassette` with a `library` parent emits `libraryId` in the
create payload. The cassette service persists that as `lineage.libraryId`.
Summary aggregation uses the domain summary contract: `cassette -> library`
via `libraryId`.

## Access

Access uses the `libraries` feature key and organization lineage. Create and
update require `libraries:write`; delete requires `libraries:admin` with delete
authority.

## Related

- [domain-cnc](../../../packages/domain-cnc/README.md) - entity, summary, construction, and field-access contracts
- [components/entities/Library](../../../components/entities/Library/README.md) - card display contract
