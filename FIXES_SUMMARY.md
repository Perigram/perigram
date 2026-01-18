# Fixes Summary - 2026-01-18

## Issues Fixed

### 1. Nesting Worker Layer Handling ✅
**Problem**: Worker was trying to copy ALL entities for nesting algorithm, causing "Not all items could be placed" error.  
**Fix**: 
- Added `all_layers` parameter to `get_entities_from_dxf_file()`
- Nesting algorithm uses only nesting layer entities (handles filtering)
- Result generation uses all layers (`all_layers=True`)
- Now includes cuts, bends, markings in result DXF

### 2. Baked Cassettes Storage ⚠️ (In Progress)
**Problem**: Baked parametric cassettes were saved in `cassettes` collection, polluting template library.  
**Fix**:
- Created separate `baked_cassettes` collection
- Added 24-hour TTL expiration
- Worker checks both collections
- Templates remain clean, baked instances temporary

**Status**: Worker not finding baked cassettes - debugging in progress with added logging

### 3. Run Numbers ✅
**Problem**: Runs didn't have display numbers.  
**Fix**:
- Added `runNumber` field in `repository.addRun()`
- Auto-incremented based on current runs count
- Displayed in UI as `#1`, `#2`, etc.

### 4. Batch Status Incorrect ✅
**Problem**: Batch had NESTING/COMPLETE/ERROR statuses which should only be on runs.  
**Fix**:
- Batch status now only: `DRAFT` | `CUT`
- Run status: `NESTING` | `ERROR` | `COMPLETE` | `CHOSEN`
- Updated store polling to check run statuses
- Removed batch status optimistic updates

### 5. Error Run Artifacts Cleanup ✅
**Problem**: Artifacts from error runs weren't deleted.  
**Fix**:
- Added auto-deletion in `nest.post.js`
- When starting new nesting, deletes artifacts from previous NESTING runs before marking them as ERROR

### 6. Run Artifacts Display ✅
**Problem**: Artifacts weren't associated with/displayed for runs.  
**Fix**:
- Added `getRunArtifacts()` helper
- Display artifacts count and types in run cards
- Can select run to view its artifacts
- Visual indicator for selected run

### 7. Cassette Template Status Removal (Pending)
**Problem**: Cassette templates shouldn't have "status" field.  
**Status**: Not yet removed - need to check cassette schema

## Files Changed
- `workers/nesting/core/main.py` - Layer handling fix, baked cassettes lookup
- `server/features/parametric-cassettes/repository.js` - Separate baked collection
- `server/features/batches/repository.js` - Run numbers
- `server/api/batch/[id]/nest.post.js` - Error artifact cleanup
- `stores/batches.js` - Run-based polling
- `components/BatchEditor.vue` - Run numbers, artifacts display, status fixes
