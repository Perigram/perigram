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

### cassette_designs
*Cassette-designs - manages cassette designs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.geometry` | String | geometry field |
| `data.layerData` | String | layer data field |
| `data.parameters` | Array | parameters field |
| `data.polygonParts` | Array | polygon parts field |

### cassette_instances
*Cassette-instances - manages cassette instances*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.cassetteDesignId` | String | cassette design id field |
| `data.sheetDesignId` | String | sheet design id field |
| `data.source` | String | source field |

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

### catalogs
*Catalogs - manages catalogs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.material` | String | material field |
| `data.options` | Array | options field |
| `data.pricing` | String | pricing field |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |

### collection_name
*_template - manages collection name*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.customField` | String | custom field field |

### colors
*Colors - manages colors*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.code` | String | code field |
| `data.visuals` | Array | visuals field |

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

### geometry_captures
*Geometry-captures - manages geometry captures*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.activeRevisionId` | String | active revision id field |
| `data.calibration` | String | calibration field |
| `data.extraction` | String | extraction field |
| `data.geometry` | String | geometry field |
| `data.mode` | String | mode field |
| `data.output` | String | output field |
| `data.prompt` | String | prompt field |
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

### layer_standards
*Layer-standards - manages layer standards*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.aliases` | Array | aliases field |
| `data.allowedGeometry` | String | allowed geometry field |
| `data.category` | String | category field |
| `data.code` | String | code field |
| `data.defaultExport` | String | default export field |
| `data.defaultPenId` | String | default pen id field |
| `data.description` | String | description field |
| `data.group` | String | group field |
| `data.i18n` | String | i18n field |
| `data.kind` | String | kind field |
| `data.parameters` | Array | parameters field |
| `data.parameterSchema` | String | parameter schema field |
| `data.production` | String | production field |
| `data.purpose` | String | purpose field |
| `data.source` | String | source field |

### libraries
*Libraries - manages libraries*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.description` | String | description field |
| `data.material` | String | material field |

### machines
*Machines - manages machines*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.boundaryOffset` | String | boundary offset field |
| `data.description` | String | description field |
| `data.systemKey` | String | system key field |
| `data.workingArea` | String | working area field |

### material_options
*Material-options - manages material options*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |

### material_piles
*Material-piles - manages material piles*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.color` | String | color field |
| `data.material` | String | material field |
| `data.note` | String | note field |
| `data.serial` | String | serial field |
| `data.specs` | Array | specs field |
| `data.stock` | String | stock field |
| `data.stockMovements` | Array | stock movements field |

### materials
*Materials - manages materials*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.code` | String | code field |
| `data.description` | String | description field |

### nesting_runs
*Nesting-runs - manages nesting runs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.artifactIds` | Array | artifact ids field |
| `data.layoutData` | String | layout data field |
| `data.note` | String | note field |
| `data.results` | Array | results field |

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

### pen_templates
*Pen-templates - manages pen templates*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.stroke` | String | stroke field |
| `lineage.userId` | ObjectId \| string | Lineage link to userId |

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

### profile_templates
*Profile-templates - manages profile templates*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |
| `lineage.userId` | ObjectId \| string | Lineage link to userId |

### projects
*Projects - manages projects*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |

### queues
*Queues - manages queues*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.job` | String | job field |
| `data.nestingSettings` | Array | nesting settings field |
| `data.queueNumber` | String | queue number field |

### remnants
*Remnants - manages remnants*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.attachment` | String | attachment field |
| `data.geometry` | String | geometry field |
| `data.isReusable` | String | is reusable field |
| `data.note` | String | note field |
| `data.queueId` | String | queue id field |
| `data.serial` | String | serial field |
| `data.source` | String | source field |
| `data.specs` | Array | specs field |

### requisitions
*Requisitions - manages requisitions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.currency` | String | currency field |
| `data.items` | Array | items field |
| `data.notes` | Array | notes field |
| `data.requisitionNumber` | String | requisition number field |
| `data.totalPrice` | String | total price field |

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

### sheets
*Sheets - manages sheets*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.compositionHash` | String | composition hash field |
| `data.machineSnapshot` | String | machine snapshot field |
| `data.materialSnapshot` | String | material snapshot field |
| `data.materialSource` | String | material source field |
| `data.note` | String | note field |
| `data.serial` | String | serial field |
| `data.sheetIndex` | String | sheet index field |
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

### tool_profiles
*Tool-profiles - manages tool profiles*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.angle` | String | angle field |
| `data.description` | String | description field |
| `data.diameter` | String | diameter field |
| `data.kerf` | String | kerf field |
| `lineage.userId` | ObjectId \| string | Lineage link to userId |

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

### warehouses
*Warehouses - manages warehouses*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.address` | String | address field |
| `data.contactPerson` | String | contact person field |
| `data.stats` | Array | stats field |
| `data.type` | String | type field |

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
