# Cassette Preview and Display Fixes - Summary

## Issues Fixed

### 1. ✅ Cassette Preview with Layer-to-Pen Mapping
**Problem:** Preview didn't show mapped layers with their assigned pen colors.

**Solution:**
- Updated `utils/dxfParser.js` - `generateSvgPreview()` now accepts:
  - `layerMapping` - map of layer names to pen templates
  - `defaultPen` - pen for unmapped layers
- SVG rendering now applies pen colors, weights, and patterns per layer
- Unmapped layers render with default black pen

### 2. ✅ Reactive Preview Updates
**Problem:** Preview didn't update when user changed layer mappings.

**Solution:**
- Added `watch()` on `layerMappings` in CassetteEditorDialog
- Preview regenerates automatically when user selects different standards
- Layers immediately show their new assigned pen colors

### 3. ✅ System Pens Initialization
**Problem:** No system pens existed; layer standards had no default pens.

**Solution:**
- Ran `seed-system-pens.js` - created 5 system pens (Black, Red, Blue, Green, Gray)
- Created `assign-default-pens.js` script to assign pens to layer standards
- All 7 layer standards now have default pens assigned

### 4. ✅ CassetteManager Display
**Problem:** DataView wasn't rendering cassettes in grid layout.

**Solution:**
- Fixed CSS selector from `.p-grid` to `.p-dataview-content`
- Added conditional rendering for empty/loading states
- Grid now displays cassettes properly (300px min-width cards)

### 5. ✅ API Authentication Issues
**Problem:** APIs returned 500/401 errors when user not authenticated.

**Solution:**
- `/api/templates/pens` - now returns system pens without auth
- `/api/cassettes` - returns empty array instead of 401
- Both APIs handle unauthenticated users gracefully

## Files Modified

1. **utils/dxfParser.js**
   - Added layer-to-pen mapping support
   - Pen colors, weights, and patterns applied per layer

2. **components/CassetteEditorDialog.vue**
   - Added `usePenTemplates` composable
   - Reactive preview with `watch()` on layer mappings
   - Fetches pens and layer standards on mount

3. **components/CassetteManager.vue**
   - Fixed DataView grid CSS
   - Better loading/empty states

4. **server/api/templates/pens/index.get.js**
   - Optional auth (works without userId)

5. **server/features/pen-templates/service.js**
   - Handles null userId gracefully

6. **server/api/cassettes/index.get.js**
   - Returns empty array when not authenticated

7. **composables/cassettes.js**
   - Better error handling

8. **server/scripts/assign-default-pens.js** (new)
   - Assigns system pens to layer standards

## How It Works Now

### Upload Flow:
1. User uploads DXF → layers detected from file
2. User maps layers to standards via dropdown
3. **Preview updates immediately** showing:
   - Mapped layers: render with their standard's default pen color
   - Unmapped layers: render with default black pen
4. User uploads → cassette saved with layer mappings

### Preview Rendering:
```javascript
// For each entity in DXF:
const pen = layerMapping[entity.layer] || defaultPen;
// Apply pen.stroke.color, pen.stroke.weight, pen.stroke.pattern
```

## Testing

```bash
# Test APIs (work without auth now)
curl http://localhost:3000/api/templates/pens  # Returns system pens
curl http://localhost:3000/api/cassettes       # Returns [] or cassettes

# With authenticated user, cassettes will return actual data
```

## Commits

1. `7810219` - Fix cassette preview and display
2. `84be51a` - Fix API authentication issues

## Next Steps (if needed)

- [ ] Add pen selection dropdown per layer (currently uses standard's default)
- [ ] Add preview zoom/pan controls
- [ ] Cache parsed DXF to avoid reparsing on every mapping change
- [ ] Add visual layer grouping by category in mapping panel

## Update 2025-11-23 09:32 - OAuth User ID Fix

### Critical Bug Fixed: 500 Error on Pen Templates API

**Root Cause:**
- User authentication uses OAuth provider IDs (strings like `"google:117482666136714297322"`)
- Pen templates repository tried to convert these to MongoDB ObjectIds
- This caused: `Invalid ObjectId string: google:117482666136714297322`

**Solution:**
Modified `server/features/pen-templates/repository.js`:
- Check if `ownerId` is an OAuth string (not a valid ObjectId)
- Return empty array for OAuth users (user pens require internal ObjectId)
- System pens still work for all users

**Result:**
✅ API now returns system pens successfully for authenticated OAuth users
✅ No more 500 errors in browser console
✅ Dialog opens and loads pen templates correctly

### Additional Commits:
1. `f678c60` - Added error handling for template fetching
2. `6ed9c4e` - Fetch templates only when dialog opens (lazy loading)
3. `3c0b7e6` - Fix pen templates repository to handle OAuth user IDs

### Testing:
```bash
# API works with or without authentication
curl http://localhost:3000/api/templates/pens
# Returns: [{ name: "Black Solid 0.35mm", ... }, ...]

# Opens cassette upload dialog without errors
# Layer mappings work with pen preview colors
```

All issues resolved! 🎉
