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
| `data.geometry` | String | geometry field |
| `data.parameters` | Array | parameters field |

### cassette_instances
*Cassette-instances - manages cassette instances*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Standard Identity Block (uid, name) |
| `origin` | Object | Standard Origin Block (creation state) |
| `status` | Object | Standard Status Block (current state) |
| `lineage` | Object | Standard Lineage Block (ancestor IDs) |
| `attachments` | Object | Standard Attachments Block (files) |
| `data.reference` | String | reference field |
| `data.serial` | String | serial field |

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
| `data.organizationId` | String | organization id field |
| `data.parameters` | Array | parameters field |
| `data.type` | String | type field |
| `data.userId` | String | user id field |
| `lineage.templateId` | ObjectId \| string | Lineage link to templateId |

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
| `data.category` | String | category field |
| `data.code` | String | code field |
| `data.defaultPenId` | String | default pen id field |
| `data.i18n` | String | i18n field |
| `data.parameters` | Array | parameters field |

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
| `data.quantity` | Number | quantity field |
| `data.serial` | String | serial field |
| `data.specs` | Array | specs field |
| `data.stock` | String | stock field |

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
| `data.job` | String | job field |
| `data.layoutData` | String | layout data field |
| `data.queueNumber` | String | queue number field |
| `data.results` | Array | results field |

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
| `data.geometry` | String | geometry field |
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
| `data.serial` | String | serial field |
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

