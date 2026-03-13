# Data Model (Generated)

This document is procedurally generated from the actual codebase. It reflects the refactored v24 Standardized architecture using blocks.

## Collections

### artifacts
*Artifacts - manages artifacts*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.fileId` | ObjectId | file id field |
| `data.metadata` | String | metadata field |

### cassette_designs
*Cassette Designs - manages cassette designs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.data` | String | data field |
| `data.dxfId` | ObjectId | dxf id field |
| `data.geometry` | Object | geometry field |
| `data.parameters` | String | parameters field |

### cassette_instances
*Cassette Instances - manages cassette instances*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |

### cassettes
*Cassettes - manages cassettes*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.data` | String | data field |
| `data.definition` | String | definition field |
| `data.dxfId` | ObjectId | dxf id field |
| `data.geometry` | Object | geometry field |
| `data.parameters` | String | parameters field |
| `data.type` | String | Category or type enum |

### catalogs
*Catalogs - manages catalogs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.currency` | String | currency field |
| `data.foilThicknesses` | String | foil thicknesses field |
| `data.lengths` | String | lengths field |
| `data.material` | String | material field |
| `data.pricePerSqm` | String | price per sqm field |
| `data.pricing` | Object | pricing field |
| `data.sheetThicknesses` | String | sheet thicknesses field |
| `data.widths` | String | widths field |

### colors
*Colors - manages colors*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.hexCode` | String | hex code field |
| `data.textureUrl` | String | texture url field |
| `data.visuals` | Object | visuals field |

### invitations
*Invitations - manages invitations*

| Field | Type | Description |
|---|---|---|
| `status` | Object | Current entity state |

### layer_standards
*Layer Standards - manages layer standards*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data.defaultPenId` | ObjectId | default pen id field |
| `data.i18n` | String | i18n field |
| `data.parameters` | String | parameters field |
| `data.ru` | Object | ru field |

### material_options
*Material Options - manages material options*

| Field | Type | Description |
|---|---|---|

### material_piles
*Material Piles - manages material piles*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.specs` | String | Standard engineering specifications |
| `data.stock` | Object | Inventory level tracking |
| `data.total` | Number | total field |
| `data.used` | Number | used field |

### materials
*Materials - manages materials*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `data` | Object | data field |
| `data.description` | String | description field |

### nesting_runs
*Nesting Runs - manages nesting runs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data.artifactIds` | Array | artifact ids field |
| `data.efficiency` | String | efficiency field |
| `data.layoutData` | String | layout data field |
| `data.remnantArea` | String | remnant area field |
| `data.results` | Object | results field |
| `data.sheetCount` | Number | sheet count field |

### organizations
*Organizations - manages organizations*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.address` | String | address field |
| `data.createdBy` | String | created by field |
| `data.email` | String | Contact email |
| `data.phone` | String | phone field |
| `data.type` | String | Category or type enum |

### pen_templates
*Pen Templates - manages pen templates*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `data` | Object | data field |
| `data.stroke` | String | stroke field |

### projects
*Projects - manages projects*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.metadata` | String | metadata field |
| `data.summary` | String | Calculated metrics summary |

### queues
*Queues - manages queues*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.items` | String | items field |
| `data.job` | Object | job field |
| `data.materialPool` | String | material pool field |
| `data.parameters` | String | parameters field |
| `data.quantity` | String | quantity field |
| `data.specs` | String | Standard engineering specifications |
| `data.type` | String | Category or type enum |

### remnants
*Remnants - manages remnants*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.area` | String | area field |
| `data.color` | String | color field |
| `data.data` | String | data field |
| `data.dxfId` | ObjectId | dxf id field |
| `data.geometry` | Object | geometry field |
| `data.height` | String | height field |
| `data.material` | String | material field |
| `data.specs` | Object | Standard engineering specifications |
| `data.thickness` | String | thickness field |
| `data.width` | String | width field |

### requisitions
*Requisitions - manages requisitions*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.items` | String | items field |
| `data.notes` | String | notes field |

### sessions
*Sessions - manages sessions*

| Field | Type | Description |
|---|---|---|

### sheet_designs
*Sheet Designs - manages sheet designs*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data.data` | String | data field |
| `data.dxfId` | ObjectId | dxf id field |
| `data.geometry` | Object | geometry field |
| `data.specs` | String | Standard engineering specifications |
| `data.svgId` | ObjectId | svg id field |

### sheets
*Sheets - manages sheets*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.specs` | Object | Standard engineering specifications |

### status_events
*Statuses - manages status events*

| Field | Type | Description |
|---|---|---|
| `status` | Object | Current entity state |

### tool_profiles
*Tool Profiles - manages tool profiles*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `data` | Object | data field |
| `data.angle` | String | angle field |
| `data.diameter` | String | diameter field |

### users
*Users - manages users*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data.email` | String | Contact email |
| `data.isActive` | Boolean | is active field |
| `data.restrictedTo` | String | restricted to field |

### warehouses
*Warehouses - manages warehouses*

| Field | Type | Description |
|---|---|---|
| `identity` | Object | Identification and metadata block |
| `origin` | Object | Immutable creation snapshot |
| `status` | Object | Current entity state |
| `lineage` | Object | Cumulative inheritance map |
| `data` | Object | data field |
| `data.address` | String | address field |
| `data.contactPerson` | String | contact person field |
| `data.stats` | Object | stats field |
| `data.totalBatches` | Number | total batches field |
| `data.totalRemnants` | Number | total remnants field |
| `data.totalSheets` | Number | total sheets field |
| `data.type` | String | Category or type enum |

