# Data Model (Generated)

This document is procedurally generated from the actual codebase. It reflects the refactored v24 Standardized architecture using blocks.

## Collections

### artifacts
*Artifacts - manages artifacts*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.metadata` | String | metadata field |
| `data.type` | String | type field |

### cassette_designs
*Cassette-designs - manages cassette designs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.derivedFrom` | String | derived from field |
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
| `data.organizationId` | String | organization id field |
| `data.parameters` | Array | parameters field |
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
| `data.entityId` | String | entity id field |
| `data.entityType` | String | entity type field |
| `data.number` | String | number field |
| `data.reason` | String | reason field |
| `data.scope` | String | scope field |
| `data.snapshot` | String | snapshot field |
| `data.sourceStatus` | Array | source status field |

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
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |

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
| `data.email` | String | email field |
| `data.phone` | String | phone field |
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
| `data.job` | Object | Queue job definition with `items` and resolved `materialPool` |
| `data.job.items` | Array | Cassette/design entries with quantity and exact parameters |
| `data.job.materialPool` | Array | Resolved selected physical/virtual sources for nesting |
| `data.nestingSettings` | Object | Queue-local editable nesting settings used to start new runs |
| `data.nestingSettings.materialMode` | String | `VIRTUAL` or `WAREHOUSE` material source mode |
| `data.nestingSettings.virtualWidth` | Number | Virtual sheet width in millimeters |
| `data.nestingSettings.virtualLength` | Number | Virtual sheet length in millimeters |
| `data.nestingSettings.spacing` | Number | Nesting spacing in millimeters |
| `data.nestingSettings.warehouseId` | ObjectId \| string | Selected warehouse for warehouse material mode |
| `data.nestingSettings.inventoryItems` | Array | Selected inventory source keys in the queue editor |
| `data.nestingSettings.toolProfileId` | ObjectId \| string | Selected tool profile for nesting/export context |
| `data.nestingSettings.requestedArtifacts` | Array | Attachment kinds requested after nesting |
| `data.materialSource` | String | material source field |
| `data.nestingSettings` | Array | nesting settings field |
| `data.queueId` | String | queue id field |
| `data.queueNumber` | String | queue number field |
| `data.runId` | String | run id field |
| `data.sheetDesignId` | String | sheet design id field |
| `data.source` | String | source field |
| `data.specs` | Array | specs field |
| `data.virtualSource` | String | virtual source field |

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
| `lineage.manufacturerId` | ObjectId \| string | Lineage link to manufacturerId |
| `lineage.organizationId` | ObjectId \| string | Lineage link to organizationId |
| `lineage.projectId` | ObjectId \| string | Lineage link to projectId |

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
| `data.geometry` | String | geometry field |
| `data.materialPool` | String | material pool field |
| `data.specs` | Array | specs field |

### sheets
*Sheets - manages sheets*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.materialSource` | String | material source field |
| `data.queueId` | String | queue id field |
| `data.runId` | String | run id field |
| `data.serial` | String | serial field |
| `data.source` | String | source field |
| `data.specs` | Array | specs field |

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
| `data.targetId` | String | target id field |

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
| `data.role` | String | role field |
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
