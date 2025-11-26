### Locales and translations
- [x] Implement locale switcher in profile page (now it works correctly).

### Batch page
- [x] Boolean options in datatable now work

### Nesting in worker
- [ ] Need to re-develop data structures and nesting logic in worker to support nested cassettes and artifacts properly.
- [ ] Sending correct data from frontend to worker for nesting.
- [ ] Need to update request handling logic to support cassettes and artifacts.
- [ ] Nesting should use selected cassette layer and ignore other layers. This layer has to be set in nesting options from system layers

### Artifact page
- [ ] Inspect how results are generated in nesting and send it as artifacts to frontend for display
- [ ] Display artifacts grouped by batches in project artifact page's accordion view.

### Bug fixes
- [x] Fixed: Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'allowRotation')
    at BatchEditor.vue:127:56 (and other cassette options in BatchEditor.vue now work)
- [x] Fixed: toolProfiles.js:23 Failed to fetch tool profiles: FetchError: [GET] "/api/templates/tools": 500 Server Error
    at async fetchTools (toolProfiles.js:19:20)
    at async AssetsLibrary.vue:213:3 (fixed OAuth userId handling in repository)

