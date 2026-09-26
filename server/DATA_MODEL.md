# Data Model (Generated)

This document is procedurally generated from the actual codebase. It reflects the refactored v24 Standardized architecture using blocks.

## Collections

### artifact_templates
*Artifact-templates - manages artifact templates*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.activeRevisionId` | String | active revision id field |
| `data.format` | String | format field |
| `data.layout` | String | layout field |
| `data.revisions` | Array | revisions field |
| `data.variables` | Array | variables field |

### artifacts
*Artifacts - manages artifacts*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.layout` | String | layout field |
| `data.metadata` | String | metadata field |
| `data.originalFilename` | String | original filename field |
| `data.revisions` | Array | revisions field |
| `data.type` | String | type field |
| `data.values` | Array | values field |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |

### cassettes
*Cassettes - manages cassettes*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.definition` | String | definition field |
| `data.geometry` | String | geometry field |
| `data.layerData` | String | layer data field |
| `data.organizationId` | String | organization id field |
| `data.parameters` | Array | parameters field |
| `data.polygonParts` | Array | polygon parts field |
| `data.revisions` | Array | revisions field |
| `data.templateId` | String | template id field |
| `data.type` | String | type field |
| `data.userId` | String | user id field |

### entity_revisions
*Entity-revisions - manages entity revisions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.contentHash` | String | content hash field |
| `data.number` | String | number field |
| `data.reason` | String | reason field |
| `data.scope` | String | scope field |
| `data.snapshot` | String | snapshot field |
| `data.source` | String | source field |
| `data.sourceStatus` | Array | source status field |

### facade_patterns
*Facade-patterns - manages facade patterns*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.graph` | String | graph field |
| `data.revisions` | Array | revisions field |

### facades
*Facades - manages facades*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.partAssignments` | Array | part assignments field |
| `data.parts` | Array | parts field |
| `data.revisions` | Array | revisions field |

### invitations
*Invitations - manages invitations*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |

### organizations
*Organizations - manages organizations*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.address` | String | address field |
| `data.assignments` | Array | assignments field |
| `data.email` | String | email field |
| `data.invitations` | Array | invitations field |
| `data.phone` | String | phone field |
| `data.processes` | Array | processes field |
| `data.processTemplateId` | String | process template id field |
| `data.roleAssignments` | Array | role assignments field |
| `data.roles` | Array | roles field |
| `data.settings` | Array | settings field |
| `data.type` | String | type field |

### process_definitions
*Process-definitions - manages process definitions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.activeProcessDefinitionId` | String | active process definition id field |
| `data.compiled` | String | compiled field |
| `data.display` | String | display field |
| `data.entityProfiles` | Array | entity profiles field |
| `data.graph` | String | graph field |
| `data.relations` | Array | relations field |
| `data.roleGrants` | Array | role grants field |
| `data.runId` | String | run id field |
| `data.schemaVersion` | String | schema version field |
| `data.services` | Array | services field |
| `data.sockets` | Array | sockets field |
| `data.sourceTemplateId` | String | source template id field |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |

### sessions
*Sessions - manages sessions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |

### sheet_designs
*Sheet-designs - manages sheet designs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.cassetteDesigns` | Array | cassette designs field |
| `data.compositionHash` | String | composition hash field |
| `data.geometry` | String | geometry field |
| `data.machineSnapshot` | String | machine snapshot field |
| `data.materialPool` | String | material pool field |
| `data.materialSnapshot` | String | material snapshot field |
| `data.revisions` | Array | revisions field |
| `data.sheetCount` | String | sheet count field |
| `data.solveParams` | Array | solve params field |
| `data.specs` | Array | specs field |
| `data.toolSnapshot` | String | tool snapshot field |

### status_events
*Statuses - manages status events*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.note` | String | note field |

### supportMessages
*Support - manages supportMessages*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.geometry` | String | geometry field |

### users
*Users - manages users*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.email` | String | email field |
| `data.isActive` | String | is active field |
| `data.memberships` | Array | memberships field |
| `data.passwordHash` | String | password hash field |
| `data.permissions` | Array | permissions field |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |

### workflow_overrides
*Workflow-overrides - manages workflow overrides*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |
