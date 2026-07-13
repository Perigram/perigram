# COMPONENT: Generic Entity Mutation Runtime

`mutation.js` applies process-authored block field changes to persisted domain
entities. It resolves the collection and allowed root blocks from the active
domain registry, accepts only the exact field paths declared by the compiled
`mutateEntity` action, and rejects `_id`, `origin`, and `status` writes.

The process action runtime performs authorization before calling this module.
Status changes do not pass through generic persistence; they remain optional
`mutateEntity` targets executed by the status machine after block fields are
written.

This runtime is intentionally limited to compiled process actions. Feature
CRUD continues to use the normal service/repository Golden Path.
