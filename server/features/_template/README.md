# COMPONENT: Feature Template (Golden Path)

This directory serves as the canonical implementation of the **v24 Absolute Final** architecture. Every feature in `server/features/` must follow this structure strictly.

## Directory Structure

| File | Responsibility |
| :--- | :--- |
| `model.js` | Defines the Entity class (extends `BaseEntity`). Handles data mapping and `toJSON`. |
| `repository.js` | Pure MongoDB operations. Uses `toFlexibleId`. Returns raw documents. |
| `service.js` | Business logic and orchestration. Uses the access engine. |
| `index.js` | Exports the service and relevant types. |

## The Golden Rules

1.  **Strict Service-Repository**: Services never touch `db.collection`. Repositories never check permissions.
2.  **Flexible IDs**: Always use `toFlexibleId()` in Repositories to support both string UIDs and ObjectIds.
3.  **Standard Blocks**: Every entity must have `identity`, `status`, `origin`, and `lineage` blocks.
4.  **Serialized Outputs**: Services must return `Model.toJSON()` results, never raw DB documents.
5.  **Central Registry**: `server/runtime/app-registry.js` explicitly registers every entity service.
6.  **Explicit Side-Effects**: Use the `hooks` object in the service to define side-effects triggered by the Status Engine.
7.  **Process Updates Stay Owned**: If a feature can be mutated by non-status process `updateEntity` actions, its service exports a `processUpdate(id, patch, auth)` handler. The handler applies field-policy-approved canonical block paths through that feature's own repository/model boundary; process definitions must not call generic update signatures or write the feature collection directly.

## Boilerplate Snippets

### Service Registration

Add the feature service to `server/runtime/app-registry.js`:

```javascript
import * as featureService from '~/server/features/feature-name/service.js';

const entityServices = {
  feature_name: featureService
};
```

### Flexible Repository Query
```javascript
import { toFlexibleId } from '../../utils/objectid.js';

export async function findById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(uid) });
}
```
