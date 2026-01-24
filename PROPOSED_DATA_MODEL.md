# Proposed Lean Data Model (Functional Only)

This model moves all temporal, ownership, and audit data to the central `statuses` collection. Main entities contain only the data required for business logic.

## 0. Central Registry: `statuses`
All "Who, When, and Status" data lives here.
- `_id`: ObjectId
- `entityId`: ObjectId (Ref to any entity below)
- `entityType`: String (e.g., 'project', 'queue') // Required for polymorphic lookup/filtering
- `status`: String (The new state - this is the ONLY place status is stored)
- `userId`: String (OAuth ID of who performed the action)
- `timestamp`: Date
- `note`: String (Optional reason/comment)
- `metadata`: Object (Utility fields: e.g., { location: "Machine-1", temperature: 22 })

---

## 1. `projects`
- `_id`: ObjectId
- `slug`: String (Unique index)
- `name`: String
- `contractorId`: ObjectId (Ref to organization)
- `batchIds`: Array<ObjectId>
- `queueIds`: Array<ObjectId>
- `metadata`: Object (Custom extensible data)
// Status is handled via the centralized 'statuses' collection.
// Statistics (totalArea, etc.) are computed on-the-fly or via aggregation.

## 2. `queues`
- `_id`: ObjectId
- `projectSlug`: String
- `queueNumber`: Number 
- `name`: String
- `entries`: Array<{ templateId: ObjectId, quantity: Number, parameters: Object }> 
- `additionalFiles`: Array<ObjectId>
- `previousRemainder`: ObjectId (Ref to remnant)
- `runs`: Array<Object> (Nesting results/metadata)
- `chosenRunId`: ObjectId
- `artifacts`: Array<ObjectId> (Link to generated files)
// Status is handled via the centralized 'statuses' collection.
// organizationId is inherited from the parent project.

## 3. `cassette_designs` (New)
Reusable geometry/draft data.
- `_id`: ObjectId
- `cassetteTemplateId`: ObjectId (Ref to 'cassettes' collection) 
- `projectId`: ObjectId
- `queueId`: ObjectId
- `parameters`: Object (Applied values for parametric logic) 
- `geometry`: Object (Flattened paths/vectors)
- `metadata`: Object

## 4. `cassette_instances`
Physical item tracking (The actual item produced).
- `_id`: ObjectId
- `cassetteDesignId`: ObjectId (Ref to cassette_designs)
- `instanceNumber`: String (e.g., "Q1-1")
- `projectSlug`: String
- `queueId`: ObjectId
- `note`: String
// Status is handled via the centralized 'statuses' collection.

## 5. `cassettes` (Templates)
Master definitions/DXF uploads.
- `_id`: ObjectId
- `name`: String
- `slug`: String
- `dxfId`: ObjectId (GridFS link to source) // In template: defines the geometry
- `svgId`: ObjectId (GridFS link to preview) // In template: for UI display
- `layerMapping`: Object // In template: defines how to parse the DXF
- `nestingLayerCode`: String
- `parameters`: Array<String>
- `polygonParts`: Array<Object> // In template: extracted polygons for nesting
- `options`: Object (holes, rotation, offsets)
- `type`: Enum (STANDARD, PARAMETRIC)

## 6. `sheet_designs` (New)
Nesting layout definition.
- `_id`: ObjectId
- `queueId`: ObjectId
- `projectId`: ObjectId
- `geometry`: Object (Nesting layout vectors)
- `metadata`: Object

## 7. `sheets` (Instances)
Physical sheet tracking.
- `_id`: ObjectId
- `sheetNumber`: String
- `batchId`: ObjectId
- `pileId`: ObjectId
- `warehouseId`: ObjectId
- `organizationId`: ObjectId
- `material`: String
- `color`: String
- `thickness`: Number
- `width`: Number
- `height`: Number
- `queueId`: ObjectId
- `cassetteInstanceIds`: Array<ObjectId>
- `remnantIds`: Array<ObjectId>
- `note`: String
// Status is handled via the centralized 'statuses' collection.

## 8. `remnants`
Reusable sheet fragments.
- `_id`: ObjectId
- `remnantNumber`: String
- `sheetId`: ObjectId
- `warehouseId`: ObjectId
- `organizationId`: ObjectId
- `material`: String
- `color`: String
- `thickness`: Number
- `geometryDxf`: String
- `area`: Number
- `width`: Number
- `height`: Number
- `isReusable`: Boolean
- `usedInQueueId`: ObjectId
// Status is handled via the centralized 'statuses' collection.

## 9. `requisitions`
- `_id`: ObjectId
- `requisitionNumber`: String
- `contractorId`: ObjectId
- `manufacturerId`: ObjectId
- `projectId`: ObjectId
- `queueId`: ObjectId
- `items`: Array<Object> (Snapshot of material specs)
- `totalAmount`: Number
- `notes`: String
// Status is handled via the centralized 'statuses' collection.

## 10. `material_batches`
- `_id`: ObjectId
- `batchNumber`: String
- `receiptId`: String
- `supplierId`: ObjectId
- `warehouseId`: ObjectId
- `requisitionId`: ObjectId
- `organizationId`: ObjectId
- `piles`: Array<Object> (partyId, count, dimensions, color)
- `notes`: String

## 11. `organizations`
- `_id`: ObjectId
- `name`: String
- `type`: Enum (Manufacturer, Contractor, etc.)
- `email`: String
- `phone`: String
- `address`: String
- `settings`: Object (canCut, canInstall, balance)

## 12. `warehouses`
- `_id`: ObjectId
- `name`: String
- `organizationId`: ObjectId
- `address`: String
- `contactPerson`: String

## 13. `catalogs`
- `_id`: ObjectId
- `name`: String
- `manufacturerId`: ObjectId
- `description`: String
- `material`: String
- `foilThicknessOptions`: Array<Number>
- `sheetThicknessOptions`: Array<Number>
- `widthOptions`: Array<Number>

## 14. `colors`
- `_id`: ObjectId
- `catalogId`: ObjectId
- `name`: String
- `code`: String
- `colorCode`: String
- `pricePerSqm`: Number

## 15. `artifacts`
- `_id`: ObjectId
- `type`: Enum (LAYOUT_SVG, GCODE, etc.)
- `name`: String
- `queueId`: ObjectId
- `projectId`: ObjectId
- `runId`: ObjectId
- `fileId`: ObjectId (GridFS link)
- `mimeType`: String
- `fileSize`: Number
- `metadata`: Object
- `generatedBy`: String (Service name)
