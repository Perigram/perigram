# Data Model (Generated)

This document is procedurally generated from the actual codebase using `server/utils/extract-data-models.js`. It reflects the current state of the database schema.

## Collections

### artifacts
*Artifacts - manages artifacts*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `fileId` | ObjectId | file id field |
| `identity` | String | identity field |
| `lineage` | Object | lineage field |
| `metadata` | String | Additional metadata |
| `origin` | String | origin field |
| `queueId` | ObjectId | queue id field |
| `runId` | ObjectId | run id field |
| `status` | Array | Current status |

### cassette_designs
*Cassette Designs - manages cassette designs*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `data` | String | data field |
| `dxfId` | ObjectId | dxf id field |
| `geometry` | Object | geometry field |
| `identity` | String | identity field |
| `status` | Array | Current status |

### cassette_instances
*Cassette Instances - manages cassette instances*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `designId` | ObjectId | design id field |
| `identity` | Object | identity field |
| `lineage` | String | lineage field |
| `memberships` | Array | memberships field |
| `reference` | String | reference field |
| `role` | String (enum) | User role |
| `serial` | String | serial field |
| `status` | Array | Current status |
| `updatedAt` | Date | Last update timestamp |

### cassettes
*Cassettes - manages cassettes*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `data` | String | data field |
| `definition` | Object | definition field |
| `dxfId` | ObjectId | dxf id field |
| `geometry` | Object | geometry field |
| `identity` | String | identity field |
| `lineage` | Object | lineage field |
| `mapping` | String | mapping field |
| `organizationId` | ObjectId | Organization reference |
| `origin` | String | origin field |
| `parameters` | Array | parameters field |
| `status` | Array | Current status |
| `templateId` | ObjectId | template id field |
| `type` | String (enum) | type field |

### catalogs
*Catalogs - manages catalogs*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `currency` | String | currency field |
| `foilThicknesses` | Array | foil thicknesses field |
| `identity` | String | identity field |
| `lengths` | Array | lengths field |
| `manufacturerId` | ObjectId | manufacturer id field |
| `material` | String | material field |
| `name` | String | Display name |
| `organizationData` | Object | organization data field |
| `organizationId` | ObjectId | Organization reference |
| `pricePerSqm` | Number | price per sqm field |
| `pricing` | Object | pricing field |
| `role` | String | User role |
| `sheetThicknesses` | Array | sheet thicknesses field |
| `status` | Array | Current status |
| `userId` | String | User ID (OAuth string) |
| `widths` | Array | widths field |
| `updatedAt` | Date | Last update timestamp |

### colors
*Colors - manages colors*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `code` | String | code field |
| `hexCode` | String | hex code field |
| `identity` | Object | identity field |
| `textureUrl` | String | texture url field |
| `visuals` | Object | visuals field |
| `updatedAt` | Date | Last update timestamp |

### invitations
*Invitations - manages invitations*

| Field | Type | Description |
|---|---|---|
| `createdBy` | String | created by field |
| `isActive` | Boolean | is active field |
| `organizationId` | ObjectId | Organization reference |
| `organizationName` | String | organization name field |
| `role` | String (enum) | User role |
| `status` | String | Current status |
| `createdAt` | Date | Creation timestamp |
| `expiresAt` | Date | expires at field |
| `revokedAt` | Date | revoked at field |
| `usedAt` | Date | used at field |

### layer_standards
*Layer Standards - manages layer standards*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `defaultPenId` | ObjectId | default pen id field |
| `i18n` | String | i18n field |
| `identity` | String | identity field |
| `parameters` | Array | parameters field |
| `ru` | Object | ru field |

### material_options
*Material Options - manages material options*

| Field | Type | Description |
|---|---|---|
| `createdAt` | Date | Creation timestamp |
| `updatedAt` | Date | Last update timestamp |

### material_piles
*Material Piles - manages material piles*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `catalogId` | ObjectId | catalog id field |
| `catalogs` | String | catalogs field |
| `colorId` | ObjectId | color id field |
| `identity` | String | identity field |
| `material` | String | material field |
| `name` | String | Display name |
| `organizationData` | Object | organization data field |
| `organizationId` | ObjectId | Organization reference |
| `permissions` | Object | Access permissions |
| `piles` | Array | piles field |
| `requisitionId` | ObjectId | requisition id field |
| `role` | String | User role |
| `specs` | Array | specs field |
| `status` | Array | Current status |
| `stock` | Object | stock field |
| `total` | Number | total field |
| `totalBatches` | Number | total batches field |
| `totalCount` | Number | total count field |
| `used` | Number | used field |
| `usedCount` | Number | used count field |
| `userId` | String | User ID (OAuth string) |
| `warehouseId` | ObjectId | warehouse id field |
| `updatedAt` | Date | Last update timestamp |

### materials
*Materials - manages materials*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `updatedAt` | Date | Last update timestamp |

### nesting_runs
*Nesting Runs - manages nesting runs*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `artifactIds` | Array | artifact ids field |
| `efficiency` | String | efficiency field |
| `layoutData` | String | layout data field |
| `remnantArea` | String | remnant area field |
| `results` | Object | results field |
| `sheetCount` | Number | sheet count field |
| `status` | Array | Current status |
| `updatedAt` | Date | Last update timestamp |

### organizations
*Organizations - manages organizations*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `address` | String | address field |
| `balance` | Number | balance field |
| `canCut` | String | can cut field |
| `canInstall` | String | can install field |
| `createdBy` | String | created by field |
| `email` | String | Email address |
| `memberships` | Array | memberships field |
| `name` | String | Display name |
| `organizationId` | ObjectId | Organization reference |
| `phone` | String | phone field |
| `role` | String (enum) | User role |
| `status` | String | Current status |
| `type` | String (enum) | type field |
| `updatedAt` | Date | Last update timestamp |

### pen_templates
*Pen Templates - manages pen templates*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `name` | String | Display name |
| `ownerId` | ObjectId | Owner user ID (OAuth string) |
| `stroke` | String | stroke field |

### projects
*Projects - manages projects*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `identity` | String | identity field |
| `lineage` | Object | lineage field |
| `metadata` | String | Additional metadata |
| `organizationId` | ObjectId | Organization reference |
| `origin` | String | origin field |
| `status` | Array | Current status |
| `summary` | String | summary field |
| `updatedAt` | Date | Last update timestamp |

### queues
*Queues - manages queues*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `entries` | Array | entries field |
| `identity` | Object | identity field |
| `items` | Array | items field |
| `job` | Object | job field |
| `materialPool` | String | material pool field |
| `memberships` | Array | memberships field |
| `organizationId` | ObjectId | Organization reference |
| `ownerId` | ObjectId | Owner user ID (OAuth string) |
| `parameters` | Array | parameters field |
| `permissions` | Object | Access permissions |
| `quantity` | String | quantity field |
| `queueCount` | Number | queue count field |
| `role` | String (enum) | User role |
| `runs` | ObjectId | runs field |
| `slug` | String | URL-friendly identifier |
| `specs` | Array | specs field |
| `status` | Array | Current status |
| `type` | String (enum) | type field |
| `userId` | String | User ID (OAuth string) |
| `updatedAt` | Date | Last update timestamp |

### remnants
*Remnants - manages remnants*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `area` | String | area field |
| `color` | String | color field |
| `data` | String | data field |
| `dxfId` | ObjectId | dxf id field |
| `geometry` | Object | geometry field |
| `height` | String | height field |
| `identity` | String | identity field |
| `isReusable` | Boolean | is reusable field |
| `material` | String | material field |
| `memberships` | Array | memberships field |
| `organizationId` | ObjectId | Organization reference |
| `role` | String (enum) | User role |
| `specs` | Object | specs field |
| `status` | Array | Current status |
| `thickness` | String | thickness field |
| `totalRemnants` | Number | total remnants field |
| `userId` | String | User ID (OAuth string) |
| `warehouseId` | ObjectId | warehouse id field |
| `width` | String | width field |
| `updatedAt` | Date | Last update timestamp |

### requisitions
*Requisitions - manages requisitions*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `catalogId` | ObjectId | catalog id field |
| `color` | String | color field |
| `colorId` | ObjectId | color id field |
| `contractorId` | ObjectId | contractor id field |
| `foilThickness` | String | foil thickness field |
| `identity` | String | identity field |
| `items` | Array | items field |
| `length` | String | length field |
| `lineage` | Object | lineage field |
| `manufacturerId` | ObjectId | manufacturer id field |
| `material` | String | material field |
| `materials` | String | materials field |
| `name` | String | Display name |
| `notes` | Array | notes field |
| `organizationData` | Object | organization data field |
| `organizationId` | ObjectId | Organization reference |
| `permissions` | Object | Access permissions |
| `pricePerSqm` | Number | price per sqm field |
| `priceSnapshot` | Number | price snapshot field |
| `projectId` | ObjectId | project id field |
| `quantity` | String | quantity field |
| `role` | String | User role |
| `sheetThickness` | String | sheet thickness field |
| `sheetThicknessOptions` | Array | sheet thickness options field |
| `specs` | Object | specs field |
| `status` | Array | Current status |
| `userId` | String | User ID (OAuth string) |
| `width` | String | width field |
| `widthOptions` | Array | width options field |

### sessions
*Sessions - manages sessions*

| Field | Type | Description |
|---|---|---|
| `expiresAt` | Date | expires at field |

### sheet_designs
*Sheet Designs - manages sheet designs*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `data` | String | data field |
| `dxfId` | ObjectId | dxf id field |
| `geometry` | Object | geometry field |
| `specs` | Array | specs field |
| `status` | Array | Current status |
| `svgId` | ObjectId | svg id field |
| `updatedAt` | Date | Last update timestamp |

### sheets
*Sheets - manages sheets*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `identity` | Object | identity field |
| `lineage` | String | lineage field |
| `name` | String | Display name |
| `organizationId` | ObjectId | Organization reference |
| `role` | String | User role |
| `specs` | Object | specs field |
| `status` | Array | Current status |
| `totalRemnants` | Number | total remnants field |
| `totalSheets` | Number | total sheets field |
| `userId` | String | User ID (OAuth string) |
| `warehouseId` | ObjectId | warehouse id field |
| `updatedAt` | Date | Last update timestamp |

### status_events
*Statuses - manages status events*

| Field | Type | Description |
|---|---|---|
| `metadata` | Object | Additional metadata |
| `state` | String | state field |
| `status` | Object | Current status |
| `targetId` | ObjectId | target id field |
| `targetType` | String | target type field |
| `timestamp` | Date | timestamp field |

### tool_profiles
*Tool Profiles - manages tool profiles*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `angle` | String | angle field |
| `diameter` | String | diameter field |
| `name` | String | Display name |
| `ownerId` | ObjectId | Owner user ID (OAuth string) |

### users
*Users - manages users*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `currentOrganizationId` | ObjectId | current organization id field |
| `email` | String | Email address |
| `memberships` | Array | memberships field |
| `name` | String | Display name |
| `organizationId` | ObjectId | Organization reference |
| `permissions` | Array | Access permissions |
| `role` | String (enum) | User role |
| `status` | String | Current status |
| `lastLoginAt` | Date | last login at field |
| `updatedAt` | Date | Last update timestamp |

### warehouses
*Warehouses - manages warehouses*

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Unique document identifier |
| `address` | String | address field |
| `contactPerson` | String | contact person field |
| `identity` | String | identity field |
| `organizationId` | ObjectId | Organization reference |
| `permissions` | Object | Access permissions |
| `role` | String | User role |
| `stats` | Object | stats field |
| `status` | Array | Current status |
| `totalBatches` | Number | total batches field |
| `totalRemnants` | Number | total remnants field |
| `totalSheets` | Number | total sheets field |
| `type` | String (enum) | type field |
| `userId` | String | User ID (OAuth string) |
| `updatedAt` | Date | Last update timestamp |

