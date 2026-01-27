# COMPONENT: Queues (Production Jobs)

Defines a specific nesting job, bridging the digital production intent with physical material requirements.

## v24 Architecture
- **Job Definition**: Combines `items` (designs to cut) with a `materialPool` (available piles/sheets).
- **Inheritance**: Inherits lineage from the parent `Project`.
- **Status**: Governed by `QueueMachine` (PENDING -> NESTING -> READY -> CLOSED).

## Key Workflows
1. **Job Initialization**: Selecting baked or parametric designs and specifying quantities.
2. **Material Allocation**: Defining which piles or remnants are available for the nesting worker.
3. **Transition to Nesting**: Handing off the job to the Nesting Worker (triggered by state change).
## Data Structure
```typescript
{
  identity: { name, queueNumber },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, projectId },
  job: {
    items: Array<{ designId, quantity, parameters }>,
    materialPool: Array<{ type, id, specs }>
  }
}
```
