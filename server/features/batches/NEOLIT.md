# COMPONENT: Batches Feature

The Batches module handles production runs, allowing users to group multiple cassettes with specific quantities and parametric values.

## Core Files
- `repository.js`: Database operations on the `batches` collection.
- `service.js`: Logic for creating, updating, and status management of batches.

## Data Structure
Batches are stored in the `batches` collection.
- `projectSlug`: Reference to the parent project.
- `batchNumber`: Auto-incrementing number within the project.
- `entries`: Array of objects containing `cassetteTemplateId`, `quantity`, and parameter values.
- `status`: `DRAFT` | `CUT` (batch can only be `CUT` or `DRAFT`, not `ERROR` or `COMPLETE`).
- `runs`: Array of nesting attempts with statuses: `NESTING` | `ERROR` | `COMPLETE` | `CHOSEN`.
- `chosenRunId`: ObjectId of the chosen run (user-selected, must be `COMPLETE`).

## Key Workflows
### Batch Creation
1. User provides project slug and initial entries.
2. Service calculates the next batch number.
3. Batch is created in `DRAFT` status with empty `runs` array.

### Nesting Workflow with Runs
1. **Trigger Nesting**: `POST /api/batch/:id/nest` creates a new run with `NESTING` status and sets previous `NESTING` runs to `ERROR`.
2. **Worker Processing**: Worker updates run status to `COMPLETE` or `ERROR` when finished.
3. **Choose Run**: `POST /api/batch/:id/choose-run` marks a `COMPLETE` run as `CHOSEN` (reverts previous `CHOSEN` to `COMPLETE`).
4. **Mark as Cut**: `POST /api/batch/:id/mark-cut` changes batch status to `CUT` (requires chosen run).
5. **Reset to Draft**: `POST /api/batch/:id/reset-status` resets batch to `DRAFT` and marks all `NESTING` runs as `ERROR`.

## Related Components
- [cassettes](../cassettes/): Batches reference cassette templates.
- [artifacts](../artifacts/): Successful nesting results are stored as artifacts linked to the batch.
