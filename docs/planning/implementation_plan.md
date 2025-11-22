# Implementation Plan

**Last Updated:** 2025-11-22  
**Status:** In Progress

---

## Purpose
This is a work plan for updating the project to MVP state, where it should be functional for core use cases. It outlines phases, tasks, and documentation updates required.
In a nut-shell, service is all about paid 2d cassette nesting. Cassette is a 2d dxf file uploaded by client, with layer mappings and is derived from a template. Nesting is done in batches, which contain table describing cassette entries. Each cassette entry is derived from cassette template and has parameters like quantity and A/B/C/... as numerical dimensions of different parts. Nesting worker processes batches and generates artifacts (nested layouts).

## Documentation Structure

**Before starting work, read:**
1. `/ARCHITECTURE.md` - System design and patterns
2. `/ONBOARDING.md` - Setup and development guide  
3. `/docs/specs/data-schema.md` - Entity schemas
4. This file - Task tracker

---

## Task Legend
- [ ] Todo
- [x] Done & Reviewed
- [~] In Progress
- [!] Blocked

---

## Phase 1: Architecture Foundation ✅ COMPLETE

### 1.1 Data Schemas Review ✅ COMPLETE
- [x] Initial schemas created in `data-schema.md` (2025-11-22)
- [x] Documentation reorganized (2025-11-22)
- [x] Review LayerStandard schema for efficiency (2025-11-22: Parametric templates)
- [x] Review PenTemplate schema for efficiency (2025-11-22: Simplified)
- [x] Review ToolProfile schema for efficiency (2025-11-22: diameter+angle only)
- [x] Review CassetteTemplate schema for efficiency (2025-11-22: Removed redundant fields)
- [x] Review Batch schema for efficiency (2025-11-22: Added compound indexes)
- [x] Review Artifact schema for efficiency (2025-11-22: Added indexes)
- [x] Update `/docs/specs/data-schema.md` with finalized schemas (2025-11-22)

**Review Criteria:**
- No redundant fields
- Future-proof but not over-engineered
- Relationships clear
- Indexes planned

**Documentation:** Update `/docs/specs/data-schema.md` when schemas finalized

---

### 1.2 Module Architecture ✅ COMPLETE
- [x] Create `/server/features/` base structure (2025-11-22)
- [x] Create module template files (repository/service/index) (2025-11-22)
- [x] Document service pattern in `/ARCHITECTURE.md` (2025-11-22)
- [x] Document module boundaries in `/ARCHITECTURE.md` (2025-11-22)

**Documentation:** Update `/ARCHITECTURE.md` section "Module Structure"

---

### 1.3 Database Indexes ✅ COMPLETE
- [x] Create `/server/db/indexes.js` (2025-11-22)
- [x] Add indexes for all collections (2025-11-22)
- [x] Document index strategy in `/ARCHITECTURE.md` (2025-11-22)

**Documentation:** Update `/ARCHITECTURE.md` section "Data Model"

---

## Phase 2: Backend Implementation

### 2.1 Foundation Services ✅ COMPLETE

#### Pen Templates Module ✅ COMPLETE
- [x] Module created (2025-11-22)
- [x] API endpoints (2025-11-22)
- [x] Seed script for system pens (2025-11-22)
- [x] Documented in ARCHITECTURE.md (2025-11-22)

#### Tool Profiles Module ✅ COMPLETE
- [x] Module created (2025-11-22)
- [x] API endpoints (2025-11-22)
- [x] Seed script for system tools (2025-11-22)
- [x] Documented in ARCHITECTURE.md (2025-11-22)

#### Layer Standards Module ✅ COMPLETE
- [x] Create `/server/features/layer-standards/repository.js` (2025-11-22)
- [x] Create `/server/features/layer-standards/service.js` (2025-11-22)
- [x] Create `/server/features/layer-standards/index.js` (2025-11-22)
- [x] Create `GET /api/layer-standards` endpoint (2025-11-22)
- [x] Create seed script `/server/scripts/seed-layer-standards.js` (2025-11-22)
- [x] Schema updated for parametric templates (2025-11-22)
- [x] Seed script updated with parametric data (2025-11-22)
- [x] Update service to handle parametric templates (2025-11-22)
- [x] Run seed script and verify data (2025-11-22)
- [x] Document service API in `/ARCHITECTURE.md` (2025-11-22)
- [x] Fixed ESM imports in all repository files (2025-11-22)
- [x] Fixed mongo.js to work with standalone scripts (2025-11-22)
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

#### Pen Templates Module ✅ COMPLETE
- [x] Create `/server/features/pen-templates/repository.js` (2025-11-22)
- [x] Create `/server/features/pen-templates/service.js` (2025-11-22)
- [x] Create `/server/features/pen-templates/index.js` (2025-11-22)
- [x] Create `GET /api/templates/pens` endpoint (2025-11-22)
- [x] Create `POST /api/templates/pens` endpoint (2025-11-22)
- [x] Create `PUT /api/templates/pens/:id` endpoint (2025-11-22)
- [x] Create `DELETE /api/templates/pens/:id` endpoint (2025-11-22)
- [x] Seed default system pens (2025-11-22)
- [x] Document service API in `/ARCHITECTURE.md` (2025-11-22)
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

#### Tool Profiles Module ✅ COMPLETE
- [x] Create `/server/features/tool-profiles/repository.js` (2025-11-22)
- [x] Create `/server/features/tool-profiles/service.js` (2025-11-22)
- [x] Create `/server/features/tool-profiles/index.js` (2025-11-22)
- [x] Create `GET /api/templates/tools` endpoint (2025-11-22)
- [x] Create `POST /api/templates/tools` endpoint (2025-11-22)
- [x] Create `PUT /api/templates/tools/:id` endpoint (2025-11-22)
- [x] Create `DELETE /api/templates/tools/:id` endpoint (2025-11-22)
- [x] Seed default system tools (2025-11-22)
- [x] Document service API in `/ARCHITECTURE.md` (2025-11-22)
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

---

### 2.2 Core Services

#### Cassettes Module ✅ COMPLETE
- [x] Create `/server/features/cassettes/repository.js` (2025-11-22)
- [x] Create `/server/features/cassettes/service.js` (2025-11-22)
- [x] Create `/server/features/cassettes/index.js` (2025-11-22)
- [x] Create `POST /api/cassettes/upload` endpoint (2025-11-22)
- [x] Create `GET /api/cassettes` endpoint (2025-11-22)
- [x] Create `GET /api/cassettes/:id` endpoint (2025-11-22)
- [x] Create `PUT /api/cassettes/:id/mappings` endpoint (2025-11-22)
- [x] Create `PUT /api/cassettes/:id/parameters` endpoint (2025-11-22)
- [x] Create `DELETE /api/cassettes/:id` endpoint (2025-11-22)
- [ ] Integrate DXF layer detection
- [ ] Integrate SVG preview generation
- [x] Document service API in `/ARCHITECTURE.md` (2025-11-22)
- [ ] Document cassette upload workflow in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure", "API Patterns", and "Workflows"

#### Batches Module ✅ COMPLETE
- [x] Create `/server/features/batches/repository.js` (2025-11-22)
- [x] Create `/server/features/batches/service.js` (2025-11-22)
- [x] Create `/server/features/batches/index.js` (2025-11-22)
- [x] Create `POST /api/project/:slug/batches` endpoint (2025-11-22)
- [x] Create `GET /api/project/:slug/batches` endpoint (2025-11-22)
- [x] Create `GET /api/batch/:id` endpoint (2025-11-22)
- [x] Create `PUT /api/batch/:id` endpoint (2025-11-22)
- [x] Create `POST /api/batch/:id/nest` endpoint (2025-11-22)
- [x] Create `GET /api/batch/:id/artifacts` endpoint (2025-11-22)
- [x] Document service API in `/ARCHITECTURE.md` (2025-11-22)
- [ ] Document batch lifecycle workflow in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure", "API Patterns", and "Workflows"

#### Artifacts Module ✅ COMPLETE
- [x] Create `/server/features/artifacts/repository.js` (2025-11-22)
- [x] Create `/server/features/artifacts/service.js` (2025-11-22)
- [x] Create `/server/features/artifacts/index.js` (2025-11-22)
- [x] Create `GET /api/artifacts/:id` endpoint (2025-11-22)
- [x] Create `DELETE /api/artifacts/:id` endpoint (2025-11-22)
- [ ] Integrate GridFS for file storage
- [x] Document service API in `/ARCHITECTURE.md` (2025-11-22)
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

---

### 2.3 Worker Integration ✅ COMPLETE
- [x] Update nesting worker to use batch system (2025-11-22)
- [x] Create bridge endpoint POST /api/batch/:id/nest (2025-11-22)
- [x] Artifact generation via worker (2025-11-22)
- [x] Document worker integration in `/ARCHITECTURE.md` (2025-11-22)
- [ ] Test end-to-end nesting flow

**Documentation:** Update `/ARCHITECTURE.md` section "Workers"

---

## Phase 3: Frontend with PrimeVue

### 3.1 PrimeVue Setup ✅ COMPLETE
- [x] Install PrimeVue packages (2025-11-22)
- [x] Configure in `nuxt.config.js` (2025-11-22)
- [x] Test basic PrimeVue component renders (2025-11-22)
- [x] Document PrimeVue setup in `/ONBOARDING.md` (2025-11-22)

**Documentation:** Update `/ONBOARDING.md` section "Setup"

---

### 3.2 Core Components Migration
- [ ] Replace Button with p-button
- [ ] Replace Input with p-input-text
- [ ] Replace Select with p-dropdown
- [ ] Replace Checkbox with p-checkbox
- [ ] Replace Dialog with p-dialog
- [ ] Test all replaced components
- [ ] Document component usage in `/ONBOARDING.md`

**Documentation:** Update `/ONBOARDING.md` section "Common Tasks"

---

### 3.3 Complex Components Migration
- [ ] Replace TableEditor with p-datatable
- [ ] Replace FileUpload with p-fileupload
- [ ] Replace Tabs with p-tabview
- [ ] Test complex component interactions
- [ ] Document component usage in `/ONBOARDING.md`

**Documentation:** Update `/ONBOARDING.md` section "Common Tasks"

---

### 3.4 New Composables ✅ COMPLETE
- [x] Create `/composables/layerStandards.js` (2025-11-22)
- [x] Create `/composables/penTemplates.js` (2025-11-22)
- [x] Create `/composables/toolProfiles.js` (2025-11-22)
- [x] Create `/composables/batches.js` (2025-11-22)
- [x] Document store pattern in `/ARCHITECTURE.md` (2025-11-22)

**Documentation:** Update `/ARCHITECTURE.md` section "Frontend Architecture"

---

### 3.5 New Pages

#### Cassettes Page
- [ ] Create `/pages/cassettes/index.vue`
- [ ] Create `CassetteUploadDialog.vue` component
- [ ] Create `LayerMappingEditor.vue` component
- [ ] Create `ParameterEditor.vue` component
- [ ] Test cassette CRUD operations
- [ ] Document page structure in `/ONBOARDING.md`

**Documentation:** Update `/ONBOARDING.md` section "Project Structure"

#### Templates Page ✅ COMPLETE
- [x] Create `/pages/templates/index.vue` (2025-11-22)
- [x] Tabbed interface for Pens and Tools (2025-11-22)
- [x] Full CRUD with PrimeVue components (2025-11-22)
- [x] Test template CRUD operations (2025-11-22)
- [ ] Document page structure in `/ONBOARDING.md`

**Documentation:** Update `/ONBOARDING.md` section "Project Structure"

#### Batch Management ✅ COMPLETE
- [x] Create `/pages/project/[slug]/batches.vue` (integrated into project tabs) (2025-11-22)
- [x] Create `BatchManagement.vue` component (2025-11-22)
- [x] Create `BatchEditor.vue` component (via BatchManagement dialog) (2025-11-22)
- [ ] Create `BatchEntryEditor.vue` component
- [x] Test batch operations (2025-11-22)
- [ ] Document page structure in `/ONBOARDING.md`

**Documentation:** Update `/ONBOARDING.md` section "Project Structure"

---

## Phase 4: Integration & Testing

### 4.1 End-to-End Workflows
- [ ] Test: Upload cassette → map layers → save
- [ ] Test: Create batch → add cassette entries → run nesting
- [ ] Test: View artifacts → download files
- [ ] Test: Create custom pen → use in cassette
- [ ] Test: Create custom tool → use in cassette
- [ ] Document workflows with diagrams in `/ARCHITECTURE.md`

**Documentation:** Update `/ARCHITECTURE.md` section "Workflows"

---

### 4.2 Documentation Finalization
- [ ] Review `/ARCHITECTURE.md` completeness
- [ ] Review `/ONBOARDING.md` completeness
- [ ] Add workflow diagrams to `/ARCHITECTURE.md`
- [ ] Add troubleshooting section to `/ONBOARDING.md`
- [ ] Verify all code changes have corresponding doc updates

---

### 4.3 Quality Checks
- [ ] No console errors in browser
- [ ] No 500 errors in API calls
- [ ] All existing features still work
- [ ] Dark mode works with PrimeVue
- [ ] Responsive design maintained

---

## Phase 5: Deployment

- [ ] Create deployment checklist
- [ ] Deploy to staging
- [ ] Test on staging environment
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Mark project complete
- [ ] Update `/ARCHITECTURE.md` section "Deployment"

**Documentation:** Update `/ARCHITECTURE.md` section "Deployment"

---

## Notes Section

### Decisions Made
- 2025-11-22: Chose MongoDB over PostgreSQL (existing architecture)
- 2025-11-22: Chose readonly reactive stores over Pinia (consistency)
- 2025-11-22: Chose PrimeVue for UI library (maintainability)
- 2025-11-22: Organized documentation structure (ARCHITECTURE.md, ONBOARDING.md, DOCS_INDEX.md)
- 2025-11-22: Schema review complete - simplified ToolProfile (diameter/angle only), removed redundant fields

### Schema Review Summary (2025-11-22)
- **LayerStandard:** Added `isActive` for soft-delete
- **PenTemplate:** Users copy system pens and customize (ownerId pattern)
- **ToolProfile:** Simplified to essential fields: `diameter`, `angle` only
- **CassetteTemplate:** Removed redundant `enabled` field in LayerMapping
- **All schemas:** Comprehensive index specifications added
- 2025-11-22: Schema review complete - restructured ToolProfile.feedRates as array, removed redundant fields, added indexes

### Schema Review Summary (2025-11-22)
- **LayerStandard:** Added `isActive` for soft-delete
- **PenTemplate:** Added `isSystem` for query optimization
- **ToolProfile:** Restructured `feedRates` from object to typed array for validation
- **CassetteTemplate:** Removed redundant `enabled` field in LayerMapping
- **All schemas:** Comprehensive index specifications added

### Blockers
_List any blockers here as they arise_

### Questions
_List any open questions here_

---

## Documentation Update Rule

**Every completed task must update relevant documentation in same commit.**

See `/DOCS_INDEX.md` for documentation workflow reference.

| Task Type | Update File | Section |
|-----------|-------------|---------|
| Schema finalized | `/docs/specs/data-schema.md` | Entity interface + relationships |
| Module created | `/ARCHITECTURE.md` | Module Structure + API Patterns |
| Endpoint added | `/ARCHITECTURE.md` | API Patterns |
| Component created | `/ONBOARDING.md` | Common Tasks |
| Workflow tested | `/ARCHITECTURE.md` | Workflows |
| Config changed | `/ONBOARDING.md` | Setup |
| New page | `/ONBOARDING.md` | Project Structure |
