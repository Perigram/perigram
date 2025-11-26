# Nesting Workflow

## How Nesting Works

### 1. Cassette Upload (Frontend → Backend)

User uploads DXF with layer mapping:
```javascript
{
  "UNFOLD_LAYER": "1_3_UNFOLD_BOUNDARY",  // ← This layer used for nesting
  "CUT_LAYER": "2_1_CUT",
  "BEND_LAYER": "3_1_BEND"
}
```

### 2. Polygon Extraction (Backend)

`server/features/cassettes/service.js`:
- Gets system nesting layer code (default: `"1_3_UNFOLD_BOUNDARY"`)
- Finds which DXF layer is mapped to it (e.g., `"UNFOLD_LAYER"`)
- Extracts ALL entities from that DXF layer → `polygonParts`
- Each part: `{ coordinates: [[x,y], ...], handles: [...] }`
- Saves `polygonParts` in cassette document

### 3. Nesting Request (Frontend → Backend)

Batch nest endpoint `server/api/batch/[id]/nest.post.js`:
- Collects cassettes + quantities from batch
- Creates nesting job with `files: [{ cassetteId, count, dimensions }, ...]`
- Worker picks up job

### 4. Nesting Processing (Python Worker)

`workers/nesting/core/main.py`:
- Reads cassettes from MongoDB
- Uses `polygonParts` (nesting layer ONLY!)
- Runs nesting algorithm
- Returns transformations: `{ cassetteId, handles, x, y, angle }`

### 5. Result DXF Generation (Python Worker)

- For each transformation:
  - Opens cassette DXF
  - Extracts entities by `handles` (from nesting layer only!)
  - Applies transformation (rotate + translate)
  - Adds to result DXF
- Saves result DXF to GridFS

## Key Points

✅ **Only nesting layer entities are nested and copied to results**
✅ **Other layers (CUT, BEND, etc.) are NOT included in nesting**
✅ **Layer selection happens during cassette upload via layerMapping**
✅ **Default nesting layer: `1_3_UNFOLD_BOUNDARY`** (configurable in system settings)

## Troubleshooting

**No polygons extracted?**
- Check layer mapping includes nesting layer code
- Verify DXF has entities in mapped layer
- Check server logs for extraction messages

**Wrong entities in result?**
- Verify layer mapping points correct DXF layer to `1_3_UNFOLD_BOUNDARY`
- Check `polygonPartsCount` in cassette document

**Fallback to rectangles?**
- Happens when `polygonParts` is empty
- Worker uses `dimensions` from batch entry to create rectangles
- Useful for testing without real DXF polygons
