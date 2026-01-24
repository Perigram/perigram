# Statuses Feature

## Overview
Centralized status management system with embedded data model for performance and consistency.

## Architecture

### Data Model: Embedded StatusHistory
Status data is embedded in each entity collection for fast queries and atomic updates.

```javascript
{
  _id: ObjectId,
  name: "Entity Name",
  status: "active", // Current status (redundant but fast for queries)
  statusHistory: [  // Complete history
    {
      status: "draft",
      timestamp: Date,
      userId: String,
      note: String,
      metadata: Object
    },
    {
      status: "active",
      timestamp: Date,
      userId: String,
      note: "Approved by manager",
      metadata: {}
    }
  ]
}
```

### Service Layer: Centralized Logic
**CRITICAL RULE:** Entity services NEVER directly modify `status` or `statusHistory` fields.
All status changes go through Status Service functions.

```javascript
// ✅ CORRECT
import { addStatus, initializeStatus } from '~/server/features/statuses/service';

await addStatus('queues', queueId, 'processing', userId, 'Started nesting');
await initializeStatus('projects', projectId, userId, 'Project created');

// ❌ WRONG
await db.collection('queues').updateOne(
  { _id },
  { $set: { status: 'processing' } }
);
```

## API

### Service Functions

#### `addStatus(collection, entityId, status, userId, note, metadata)`
Add a status change to an entity. Atomic operation.

**Parameters:**
- `collection` - Collection name (e.g., 'queues', 'projects')
- `entityId` - Entity ID
- `status` - New status value
- `userId` - User making the change
- `note` - Optional note (default: '')
- `metadata` - Optional metadata object (default: {})

**Returns:** Status entry object

**Throws:** 400 if invalid status for entity type, 404 if entity not found

#### `initializeStatus(collection, entityId, userId, note)`
Initialize entity with default status. Use when creating new entities.

**Parameters:**
- `collection` - Collection name
- `entityId` - Entity ID
- `userId` - User creating the entity
- `note` - Optional note (default: 'Created')

**Returns:** Status entry object

#### `getStatusHistory(collection, entityId)`
Get full status history for an entity.

**Returns:**
```javascript
{
  currentStatus: "active",
  history: [...]
}
```

## Status Types

Defined in `types.js`. Each entity type has valid statuses:

- **cassette_template**: draft, active, archived
- **cassette_design**: draft, validated, nested, archived
- **cassette_instance**: draft, nested, cut, delivered, archived
- **sheet_design**: draft, ready, processing, completed, error, archived
- **queue**: draft, ready, processing, completed, cancelled, error
- **project**: draft, active, completed, cancelled, archived
- ... (see types.js for complete list)

## Usage Examples

### Creating Entity with Status
```javascript
// In entity service
export async function createProject(data, userId) {
  const result = await repository.create(data);
  await initializeStatus('projects', result._id.toString(), userId, 'Project created');
  return result;
}
```

### Updating Status
```javascript
// In entity service
export async function startQueue(queueId, userId) {
  // ... business logic
  await addStatus('queues', queueId, 'processing', userId, 'Nesting started');
}
```

### Querying by Status
```javascript
// Status is on root level - fast queries
const activeProjects = await db.collection('projects')
  .find({ status: 'active' })
  .toArray();
```

## Migration

See `scripts/migrate-to-embedded-status.cjs` for migrating existing data.

## UI Components

- **StatusBadge** - Display current status with icon/color
- **StatusTimeline** - Display full status history

```vue
<StatusBadge :status="queue.status" />
<StatusTimeline collection="queues" :entityId="queue._id" />
```

## Benefits

✅ **Fast**: Single query to get entity + status  
✅ **Atomic**: Status update and entity update in one operation  
✅ **Consistent**: No sync issues between separate collections  
✅ **Maintainable**: Logic centralized in Status Service  
✅ **Type-safe**: Validates status transitions  

## Implementation Notes

- Status validation happens in service layer
- Entity repositories don't know about status logic
- StatusHistory is append-only (never delete entries)
- Current status duplicated for query performance
- Migration preserves existing data for safety
