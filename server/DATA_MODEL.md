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
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.metadata` | String | metadata field |
| `data.type` | String | type field |
| `lineage.organization` | EntityReference | Structured organization reference |
| `lineage.queue` | EntityReference | Structured queue reference |

### cassette_designs
*Cassette-designs - manages cassette designs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.derivedFrom` | String | derived from field |
| `data.geometry` | String | geometry field |
| `data.layerData` | String | layer data field |
| `data.parameters` | Array | parameters field |
| `data.polygonParts` | Array | polygon parts field |
| `lineage.cassette` | EntityReference | Structured cassette reference |

### cassette_instances
*Cassette-instances - manages cassette instances*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.source` | String | source field |
| `lineage.cassetteDesign` | EntityReference | Structured cassette design reference |
| `lineage.organization` | EntityReference | Structured organization reference |
| `lineage.queue` | EntityReference | Structured queue reference |

### cassettes
*Cassettes - manages cassettes*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
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
| `lineage.cassette` | EntityReference | Structured cassette reference |
| `lineage.library` | EntityReference | Structured library reference |
| `lineage.organization` | EntityReference | Structured organization reference |

### catalogs
*Catalogs - manages catalogs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.material` | String | material field |
| `data.options` | Array | options field |
| `data.pricing` | String | pricing field |
| `lineage.organization` | EntityReference | Structured organization reference |

### collection_name
*_template - manages collection name*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.customField` | String | custom field field |
| `lineage.organization` | EntityReference | Structured organization reference |

### colors
*Colors - manages colors*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
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
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.contentHash` | String | content hash field |
| `data.entityId` | String | entity id field |
| `data.entityType` | String | entity type field |
| `data.number` | String | number field |
| `data.outcome` | String | outcome field |
| `data.reason` | String | reason field |
| `data.scope` | String | scope field |
| `data.snapshot` | String | snapshot field |
| `data.sourceStatus` | Array | source status field |
| `data.taskRunId` | String | task run id field |

### geometry_captures
*Geometry-captures - manages geometry captures*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
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
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |

### layer_standards
*Layer-standards - manages layer standards*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
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
| `lineage.organization` | EntityReference | Structured organization reference |

### libraries
*Libraries - manages libraries*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.description` | String | description field |
| `data.material` | String | material field |
| `lineage.organization` | EntityReference | Structured organization reference |

### machines
*Machines - manages machines*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.boundaryOffset` | String | boundary offset field |
| `data.default` | String | default field |
| `data.workArea` | String | work area field |
| `lineage.organization` | EntityReference | Structured organization reference |

### material_options
*Material-options - manages material options*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |

### material_piles
*Material-piles - manages material piles*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.color` | String | color field |
| `data.material` | String | material field |
| `data.serial` | String | serial field |
| `data.specs` | Array | specs field |
| `data.stock` | String | stock field |
| `data.stockMovements` | Array | stock movements field |
| `lineage.warehouse` | EntityReference | Structured warehouse reference |

### materials
*Materials - manages materials*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.code` | String | code field |
| `data.description` | String | description field |
| `data.thickness` | String | thickness field |

### organizations
*Organizations - manages organizations*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.address` | String | address field |
| `data.email` | String | email field |
| `data.phone` | String | phone field |
| `data.processTemplateId` | String | process template id field |
| `data.settings` | Array | settings field |
| `data.type` | String | type field |
| `lineage.organization` | EntityReference | Structured organization reference |

### pen_templates
*Pen-templates - manages pen templates*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.stroke` | String | stroke field |
| `lineage.user` | EntityReference | Structured user reference |

### process_definitions
*Process-definitions - manages process definitions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.activeProcessDefinitionId` | String | active process definition id field |
| `data.assignments` | Array | assignments field |
| `data.compiled` | String | compiled field |
| `data.display` | String | display field |
| `data.entityProfiles` | Array | entity profiles field |
| `data.graph` | String | graph field |
| `data.roles` | Array | roles field |
| `data.schemaVersion` | String | schema version field |
| `data.services` | Array | services field |
| `data.sockets` | Array | sockets field |
| `data.sourceTemplateId` | String | source template id field |
| `lineage.organization` | EntityReference | Structured organization reference |

### profile_templates
*Profile-templates - manages profile templates*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `lineage.organization` | EntityReference | Structured organization reference |
| `lineage.user` | EntityReference | Structured user reference |

### projects
*Projects - manages projects*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `lineage.organization` | EntityReference | Structured organization reference |

### queues
*Queues - manages queues*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.job` | String | job field |
| `data.nestingSettings` | Array | nesting settings field |
| `data.queueNumber` | String | queue number field |
| `data.selectedRevisionId` | String | selected revision id field |
| `lineage.organization` | EntityReference | Structured organization reference |
| `lineage.project` | EntityReference | Structured project reference |
| `lineage.queue` | EntityReference | Structured queue reference |

### remnants
*Remnants - manages remnants*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.attachment` | String | attachment field |
| `data.geometry` | String | geometry field |
| `data.isReusable` | String | is reusable field |
| `data.serial` | String | serial field |
| `data.source` | String | source field |
| `data.specs` | Array | specs field |
| `lineage.warehouse` | EntityReference | Structured warehouse reference |

### requisitions
*Requisitions - manages requisitions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.currency` | String | currency field |
| `data.items` | Array | items field |
| `data.notes` | Array | notes field |
| `data.requisitionNumber` | String | requisition number field |
| `data.totalPrice` | String | total price field |
| `lineage.organization` | EntityReference | Structured organization reference |

### sessions
*Sessions - manages sessions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |

### sheet_designs
*Sheet-designs - manages sheet designs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.cassetteDesigns` | Array | cassette designs field |
| `data.geometry` | String | geometry field |
| `data.layoutHash` | String | layout hash field |
| `data.materialPool` | String | material pool field |
| `data.nestingParams` | Array | nesting params field |
| `data.revisions` | Array | revisions field |
| `data.specs` | Array | specs field |
| `lineage.project` | EntityReference | Structured project reference |
| `lineage.queue` | EntityReference | Structured queue reference |

### sheet_instances
*Sheet-instances - manages sheet instances*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.layoutHash` | String | layout hash field |
| `data.physicalSheetId` | String | physical sheet id field |
| `data.sequence` | String | sequence field |

### sheets
*Sheets - manages sheets*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.serial` | String | serial field |
| `data.specs` | Array | specs field |
| `lineage.queue` | EntityReference | Structured queue reference |

### status_events
*Statuses - manages status events*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.note` | String | note field |

### supportMessages
*Support - manages supportMessages*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.geometry` | String | geometry field |

### tool_profiles
*Tool-profiles - manages tool profiles*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.angle` | String | angle field |
| `data.description` | String | description field |
| `data.diameter` | String | diameter field |
| `data.kerf` | String | kerf field |
| `lineage.user` | EntityReference | Structured user reference |

### users
*Users - manages users*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.email` | String | email field |
| `data.isActive` | String | is active field |
| `data.memberships` | Array | memberships field |
| `data.passwordHash` | String | password hash field |
| `data.permissions` | Array | permissions field |
| `data.role` | String | role field |
| `lineage.organization` | EntityReference | Structured organization reference |

### warehouses
*Warehouses - manages warehouses*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.address` | String | address field |
| `data.contactPerson` | String | contact person field |
| `data.stats` | Array | stats field |
| `data.type` | String | type field |
| `lineage.organization` | EntityReference | Structured organization reference |

### workflow_overrides
*Workflow-overrides - manages workflow overrides*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (structured ancestor references) |
| `attachments` | Object | Standard Attachments Block (files) |
| `lineage.organization` | EntityReference | Structured organization reference |

