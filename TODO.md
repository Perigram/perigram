### Locales and translations
- [x] Implement locale switcher in profile page (now it works correctly).

### Batch page
- [x] Boolean options in datatable now work

### Nesting in worker
**Status:** ❌ BLOCKED - Worker incompatible with new cassette system (see NESTING_ANALYSIS.md)

**Root Cause:**
- Worker expects `user_dxf_files` collection with `polygonParts` data
- New `cassettes` collection doesn't have polygon processing
- Worker cannot find geometry data to perform nesting

**Required Fix:**
- [ ] Add polygon processing to cassettes (generate polygonParts from DXF)
- [ ] Update nesting worker to read from cassettes collection
- [ ] Update batch nest endpoint to pass cassetteId instead of slug
- [ ] Test end-to-end: cassette upload → batch → nesting → artifacts

**See:** `/NESTING_ANALYSIS.md` for detailed analysis and solution options

### Artifact page
**Status:** ⏳ BLOCKED by nesting worker issues

- [ ] Inspect how results are generated in nesting and send it as artifacts to frontend for display
      → Worker currently saves to dxf_result_bucket and svg_result_bucket (GridFS)
      → Need to update to save via artifacts service API
- [ ] Display artifacts grouped by batches in project artifact page
      → Page exists at /pages/project/[slug]/artifacts.vue
      → Need to implement artifact preview and download's accordion view.

### Bug fixes
- [x] Fixed: Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'allowRotation')
    at BatchEditor.vue:127:56 (and other cassette options in BatchEditor.vue now work)
- [x] Fixed: toolProfiles.js:23 Failed to fetch tool profiles: FetchError: [GET] "/api/templates/tools": 500 Server Error
    at async fetchTools (toolProfiles.js:19:20)
    at async AssetsLibrary.vue:213:3 (fixed OAuth userId handling in repository)

