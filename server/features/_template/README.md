# COMPONENT: Feature Template (Golden Path)

This directory is the canonical **entity-module** template. The strict
structure below applies to persisted entities with a stable block DTO;
capability modules follow the relaxed classification in
[server/features](../README.md) (Entity vs Capability Modules).

## Directory Structure

| File | Responsibility |
| :--- | :--- |
| `model.js` | Defines the Entity class (extends `BaseEntity`). Handles data mapping and `toJSON`. |
| `repository.js` | Pure MongoDB operations. Uses `toFlexibleId`. Returns raw documents. |
| `service.js` | Business logic and orchestration. Uses the access engine. |
| `process-update-handler.js` | `createProcessUpdateHandler({ typeId, repository, Model, toDTO })` builds the feature's `processUpdate(id, patch, auth)`: it applies canonical block patches to the writable roots (`identity`, `data`, `specs`, `summary`, `attachments`, `relations`) through the feature's own repository/model boundary. Export it from the service when non-status process `updateEntity` actions target the type. |
| `index.js` | Exports the service and relevant types. |

## Rules

Feature contracts shared with the wider backend — the
service-repository split, flexible ids, standard blocks, serialized
outputs, central registry registration, hooks, and the `processUpdate`
ownership law — are canonical in
[server/features/README.md](../README.md) (Required File Structure,
Service Layer Contract, Design Rules). This template implements them.

## Boilerplate Snippets

### Service Registration

Framework feature services register in
`server/runtime/app-registry.js` through the typed instance-service
maps — a service keyed by its typeId, with explicit `processList` and
`processGetById` bindings (`registerServiceSet` throws when either is
missing):

```javascript
// server/runtime/app-registry.js
import * as featureService from '~/server/features/feature-name/service.js';

const frameworkInstanceServices = { artifact_type: featureService };
const frameworkProcessLists = {
  artifact_type: (filters, auth) => featureService.list(filters, auth.userId, auth.organizationId, auth.role, auth)
};
const frameworkProcessReads = {
  artifact_type: (id, auth) => featureService.getById(id, auth.userId, auth.organizationId, auth.role, auth)
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
