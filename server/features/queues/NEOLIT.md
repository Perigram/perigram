# COMPONENT: Queues Feature

Manages nesting jobs (renamed from "batches" in 2026-01 rework).

Note: "Batch" now refers to material deliveries, not nesting jobs.

## Core Files
- `repository.js`: Database operations on `queues` collection
- `service.js`: Business logic, nesting parameter management
- `stores/queues.js`: Frontend state management
- API endpoints in `server/api/queue/` and `server/api/project/[slug]/queues/`

## Data Structure
Collection: `queues`

Key fields:
- `queueNumber`: Incremental ID per project
- `entries`: Array of cassette requests (templateId, count, dimensions)
- `runs`: History of nesting runs
- `status`: DRAFT, NESTING, COMPLETE, CUT
- `nestingParams`: Settings for the nesting engine

## Key Workflows
1. **Creation**: User creates queue in project
2. **Configuration**: User adds cassette entries and sets nesting params
3. **Nesting**: User starts nesting run -> queued in background
4. **Selection**: User chooses best run -> status becomes CUT
5. **Manufacturing**: Queue is marked CUT, material is consumed

## Related Components
- [projects](../projects/NEOLIT.md) - Parent entity
- [cassettes](../cassettes/NEOLIT.md) - Templates used in entries
- [artifacts](../artifacts/NEOLIT.md) - Output files (DXF/PDF)