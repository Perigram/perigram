# COMPONENT: Feature Template (Golden Path)

This directory serves as the canonical implementation of the **v24 Absolute Final** architecture. Every feature in `server/features/` must follow this structure strictly.

## Directory Structure

| File | Responsibility |
| :--- | :--- |
| `model.js` | Defines the Entity class (extends `BaseEntity`). Handles data mapping and `toJSON`. |
| `repository.js` | Pure MongoDB operations. Uses `toFlexibleId`. Returns raw documents. |
| `service.js` | Business logic and orchestration. Uses the access engine and registers with the entity service registry. |
| `index.js` | Exports the service and relevant types. |

## The Golden Rules

1.  **Strict Service-Repository**: Services never touch `db.collection`. Repositories never check permissions.
2.  **Flexible IDs**: Always use `toFlexibleId()` in Repositories to support both string UIDs and ObjectIds.
3.  **Standard Blocks**: Every entity must have `identity`, `status`, `origin`, and `lineage` blocks.
4.  **Serialized Outputs**: Services must return `Model.toJSON()` results, never raw DB documents.
5.  **Central Registry**: Every service must call `registerEntityService()` during initialization to enable cross-module side-effects.
6.  **Explicit Side-Effects**: Use the `hooks` object in the service to define side-effects triggered by the Status Engine.

## Boilerplate Snippets

### Service Registration
```javascript
import { registerEntityService } from '../../core/blocks/index.js';

registerEntityService('feature_name', {
  getById: (id) => getById(id),
  hooks: {
    onStatusChange: (ctx, params) => handleStatusChange(ctx, params)
  }
});
```

### Flexible Repository Query
```javascript
import { toFlexibleId } from '../../utils/objectid.js';

export async function findById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(uid) });
}
```
