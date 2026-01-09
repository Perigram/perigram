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
- `status`: One of `DRAFT`, `READY`, `NESTING`, `COMPLETE`, `FAILED`.

## Key Workflows
### Batch Creation
1. User provides project slug and initial entries.
2. Service calculates the next batch number.
3. Batch is created in `DRAFT` status.

### Nesting Integration
When a batch is sent for nesting, its status changes to `NESTING`. Once the worker completes the job, the status is updated to `COMPLETE` (or `FAILED`).

## Related Components
- [cassettes](../cassettes/): Batches reference cassette templates.
- [artifacts](../artifacts/): Successful nesting results are stored as artifacts linked to the batch.
