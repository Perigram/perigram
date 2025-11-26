# Nesting Implementation Plan

**Date:** 2025-11-26  
**Goal:** Make nesting work with cassette system using selected nesting layer

---

## Core Concept

Each cassette has multiple layers (cut, bend, frame, dimensions). For nesting:
- User selects ONE layer as "nesting layer" (e.g., "frame" for outer boundary)
- Worker extracts geometry ONLY from that layer
- Each cassette's nesting layer = 1 polygonPart
- Multiple cassettes in batch = multiple polygonParts

---

## Implementation Steps

### Phase 1: Add Nesting Layer Selection to Cassettes

#### 1.1 Update Schema
Add `nestingLayer` field to cassettes collection:

```typescript
interface CassetteTemplate {
  // ... existing fields
  nestingLayer?: 'cut' | 'bend' | 'frame' | 'dimensions';  // Default: 'frame'
}
```

**Files:**
- `docs/specs/data-schema.md` - Document schema change
- `server/features/cassettes/service.js` - Add default nestingLayer

#### 1.2 Update Cassette Upload
Add nestingLayer field when creating cassette:

```javascript
// server/features/cassettes/service.js
const cassetteData = {
  // ... existing fields
  nestingLayer: 'frame',  // Default to frame (outer boundary)
};
```

#### 1.3 Add UI for Nesting Layer Selection
Update cassette editor to allow selecting nesting layer:

```vue
<!-- components/CassetteEditorDialog.vue -->
<div class="field">
  <label>Nesting Layer</label>
  <Select v-model="cassette.nestingLayer" :options="layerOptions" />
</div>
```

---

### Phase 2: Generate Polygon Data from Cassette DXF

#### 2.1 Create Cassette Processing Worker
Create new worker that processes cassettes (similar to fileprocessing):

**File:** `workers/cassette-processing/main.py`

```python
# Watch cassettes collection for processingStatus='pending'
# For each cassette:
#   1. Read DXF from GridFS (cassettes bucket)
#   2. Extract layers based on nestingLayer field
#   3. Generate polygonParts using existing build_geometry logic
#   4. Save polygonParts to cassettes collection
```

#### 2.2 Trigger Processing After Upload
Update cassette upload to set processingStatus:

```javascript
// server/features/cassettes/service.js
const cassetteData = {
  // ... existing
  processingStatus: 'pending',  // Changed from 'done'
  nestingLayer: 'frame'
};
```

#### 2.3 Add Polygon Generation Logic
Reuse existing fileprocessing logic:

```python
# workers/cassette-processing/core/process.py
def process_cassette(cassette_doc):
    # 1. Get cassette DXF from GridFS
    dxf_file = cassettes_bucket.open_download_stream(cassette_doc['dxfId'])
    drawing = read_dxf(dxf_file)
    
    # 2. Get nesting layer name mapping
    nesting_layer = cassette_doc.get('nestingLayer', 'frame')
    layer_names = cassette_doc['layerMapping'].get(nesting_layer, [])
    
    # 3. Filter entities by layer names
    entities = []
    for entity in drawing.modelspace():
        if entity.dxf.layer in layer_names:
            entities.append(entity)
    
    # 4. Build geometry (reuse existing logic)
    polygon_parts = build_geometry_from_entities(entities, tolerance=0.01)
    
    # 5. Save to cassettes collection
    db['cassettes'].update_one(
        {'_id': cassette_doc['_id']},
        {'$set': {
            'polygonParts': polygon_parts,
            'processingStatus': 'done'
        }}
    )
```

---

### Phase 3: Update Nesting Worker

#### 3.1 Update convert_files_to_input_items
Change from user_dxf_files to cassettes:

```python
# workers/nesting/core/main.py
def convert_files_to_input_items(files, space):
    input_items = []
    id = 0
    
    for file in files:
        cassette_id = ObjectId(file.get("cassetteId"))
        count = file.get("count")
        
        # Read from cassettes collection
        cassette = db["cassettes"].find_one({"_id": cassette_id})
        
        if not cassette:
            raise Exception(f"Cassette {cassette_id} not found")
        
        polygon_parts = cassette.get("polygonParts", [])
        
        if not polygon_parts:
            raise Exception(f"Cassette {cassette_id} has no polygon data")
        
        for part in polygon_parts:
            coords = part.get("coordinates")
            handles = part.get("handles")
            
            # Apply spacing buffer
            shapely_polygon = Polygon(coords)
            buffered_polygon = shapely_polygon.buffer(space)
            buffered_polygon_coords = list(buffered_polygon.exterior.coords)
            
            item = {
                'id': id,
                'cassette_id': str(cassette_id),
                'coords': buffered_polygon_coords,
                'handles': handles,
                'count': count
            }
            
            id += 1
            input_items.append(item)
    
    return input_items
```

#### 3.2 Update get_entities_from_dxf_file
Change to read from cassettes GridFS bucket:

```python
# workers/nesting/core/main.py
def get_entities_from_dxf_file(cassette_id, handles):
    """Read DXF from cassettes GridFS bucket"""
    cassette = db["cassettes"].find_one({"_id": ObjectId(cassette_id)})
    
    if cassette_id in dxf_document_cache:
        doc = dxf_document_cache[cassette_id]
    else:
        # Read from cassettes bucket
        dxf_file = cassettes_bucket.open_download_stream(cassette['dxfId'])
        doc = read_dxf(dxf_file)
        dxf_document_cache[cassette_id] = doc
    
    msp = doc.modelspace()
    handle_set = set(handles)
    
    entities = []
    for entity in msp:
        if entity.dxf.handle in handle_set:
            entities.append(entity)
    
    return doc, entities
```

#### 3.3 Update GridFS Bucket Access
Add cassettes bucket to mongo utils:

```python
# workers/nesting/utils/mongo.py
cassettes_bucket = GridFSBucket(db, bucket_name='cassettes')
```

---

### Phase 4: Update Backend API

#### 4.1 Update Batch Nest Endpoint
Pass cassetteId instead of slug:

```javascript
// server/api/batch/[id]/nest.post.js
const files = batch.entries.map((entry) => ({
    cassetteId: entry.cassetteTemplateId.toString(),
    count: entry.quantity
}));

// ... in nesting_jobs document
await db.collection('nesting_jobs').insertOne({
    slug: nestingSlug,
    projectSlug: batch.projectSlug,
    batchId: batch._id,
    files: files,  // Now contains cassetteId
    params,
    status: 'pending',
    createdAt: new Date(),
    ownerId: userId
});
```

#### 4.2 Update Artifacts After Nesting
Worker should update artifacts when done:

```python
# workers/nesting/main.py (after successful nesting)
# Update artifacts in artifacts collection
artifacts = db['artifacts'].find({'batchId': doc['batchId']})
for artifact in artifacts:
    artifact_type = artifact['type']
    if artifact_type == 'LAYOUT_SVG':
        # Link to SVG files in GridFS
        artifact['fileIds'] = svg_file_ids
    elif artifact_type == 'LAYOUT_DXF':
        artifact['fileIds'] = dxf_file_ids
    
    db['artifacts'].update_one(
        {'_id': artifact['_id']},
        {'$set': {
            'status': 'ready',
            'fileIds': artifact.get('fileIds', [])
        }}
    )
```

---

### Phase 5: Testing with Rectangles

#### 5.1 Create Test Rectangle Cassettes
Create simple DXF files programmatically:

```python
# test-data/create_test_rectangles.py
import ezdxf

# Rectangle A
doc = ezdxf.new()
msp = doc.modelspace()
msp.add_lwpolyline([(0,0), (100,0), (100,200), (0,200), (0,0)], dxfattribs={'layer': 'Frame'})
doc.saveas('rectangle-a.dxf')

# Rectangle B
doc = ezdxf.new()
msp = doc.modelspace()
msp.add_lwpolyline([(0,0), (150,0), (150,100), (0,100), (0,0)], dxfattribs={'layer': 'Frame'})
doc.saveas('rectangle-b.dxf')
```

#### 5.2 Test Flow
1. Upload rectangle-a.dxf as cassette with parameters ['A', 'B']
2. Upload rectangle-b.dxf as cassette with parameters ['A', 'B']
3. Set nestingLayer = 'frame' for both
4. Verify cassette-processing worker generates polygonParts
5. Create batch with entries:
   - Rectangle A: quantity=5, A=100, B=200
   - Rectangle B: quantity=3, A=150, B=100
6. Run nesting with material 2440x1220
7. Verify artifacts generated
8. Display in UI

---

## File Changes Summary

### Documentation
- [x] `NESTING_IMPLEMENTATION_PLAN.md` - This file
- [ ] `docs/specs/data-schema.md` - Add nestingLayer and polygonParts
- [ ] `ARCHITECTURE.md` - Document nesting flow

### Backend
- [ ] `server/features/cassettes/service.js` - Add nestingLayer, set processingStatus='pending'
- [ ] `server/api/batch/[id]/nest.post.js` - Pass cassetteId instead of slug

### Worker - New Files
- [ ] `workers/cassette-processing/main.py` - New worker for cassettes
- [ ] `workers/cassette-processing/core/process.py` - Cassette processing logic
- [ ] `workers/cassette-processing/utils/mongo.py` - MongoDB connection
- [ ] `workers/cassette-processing/utils/logger.py` - Copy from fileprocessing

### Worker - Modifications
- [ ] `workers/nesting/core/main.py` - Update convert_files_to_input_items, get_entities_from_dxf_file
- [ ] `workers/nesting/utils/mongo.py` - Add cassettes_bucket

### Frontend
- [ ] `components/CassetteEditorDialog.vue` - Add nestingLayer selector
- [ ] `components/BatchEditor.vue` - Show nesting status

### Testing
- [ ] Create test rectangle DXF files
- [ ] Test cassette upload → processing → batch → nesting

---

## Rollout Strategy

1. **Phase 1-2:** Add schema and cassette processing (can deploy without breaking)
2. **Phase 3-4:** Update worker and API (requires worker restart)
3. **Phase 5:** Test and validate
4. **Phase 6:** Update TODO.md and mark complete

---

## Success Criteria

- [ ] Cassettes automatically processed after upload
- [ ] polygonParts field populated in cassettes collection
- [ ] Batch nesting completes successfully
- [ ] Artifacts created with SVG/DXF files
- [ ] UI displays nesting results
- [ ] Test rectangles nest correctly on 2440x1220 sheet
