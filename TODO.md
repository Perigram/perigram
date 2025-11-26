### Locales and translations
- [x] Implement locale switcher in profile page (now it works correctly).

### Batch page
- [x] Boolean options in datatable now work

### Nesting in worker
**Status:** ✅ IMPLEMENTED - Testing required

**Completed:**
- [x] Added nestingLayer and polygonParts fields to cassettes schema
- [x] Created cassette-processing worker to generate polygon data from DXF
- [x] Updated nesting worker to read from cassettes collection (not user_dxf_files)
- [x] Modified nest endpoint to pass cassetteId instead of file slug
- [x] Worker now uses cassettes GridFS bucket for DXF access

**Testing Required:**
- [ ] Start cassette-processing worker: `cd workers/cassette-processing && python3 main.py`
- [ ] Upload test rectangle DXF with "Frame" layer
- [ ] Verify cassette processingStatus changes pending→done
- [ ] Verify polygonParts field populated in cassettes collection
- [ ] Create batch with test cassettes
- [ ] Run nesting and verify artifacts generated
- [ ] Check nested layout makes sense

**Test Files:** Rectangle DXFs available in repository root (need ezdxf to generate)

**See:** `/NESTING_IMPLEMENTATION_PLAN.md` for full implementation details

### Artifact page
**Status:** ⏳ Ready for testing (depends on nesting worker)

- [ ] Test artifact generation after nesting completes
      → Worker saves to dxf_result_bucket and svg_result_bucket (GridFS)
      → Artifacts service should link these files
- [ ] Display artifacts grouped by batches in project artifact page
      → Page exists at /pages/project/[slug]/artifacts.vue  
      → Implement artifact preview (SVG) and download (DXF)
      → Group by batch with expandable sections

### Bug fixes
- [x] Fixed: Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'allowRotation')
    at BatchEditor.vue:127:56 (and other cassette options in BatchEditor.vue now work)
- [x] Fixed: toolProfiles.js:23 Failed to fetch tool profiles: FetchError: [GET] "/api/templates/tools": 500 Server Error
    at async fetchTools (toolProfiles.js:19:20)
    at async AssetsLibrary.vue:213:3 (fixed OAuth userId handling in repository)

