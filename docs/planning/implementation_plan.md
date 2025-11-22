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

## Phase 1: Architecture Foundation

### 1.1 Data Schemas Review
- [x] Initial schemas created in `data-schema.md` (2025-11-22)
- [x] Documentation reorganized (2025-11-22)
- [x] Review LayerStandard schema for efficiency (2025-11-22: Added `isActive`, indexes)
- [x] Review PenTemplate schema for efficiency (2025-11-22: Added `isSystem`, indexes)
- [x] Review ToolProfile schema for efficiency (2025-11-22: Restructured `feedRates` as array)
- [x] Review CassetteTemplate schema for efficiency (2025-11-22: Removed redundant `enabled` field)
- [x] Review Batch schema for efficiency (2025-11-22: Added compound indexes)
- [x] Review Artifact schema for efficiency (2025-11-22: Added indexes)
- [ ] Finalize all schemas with team sign-off
- [x] Update `/docs/specs/data-schema.md` with finalized schemas (2025-11-22)

**Review Criteria:**
- No redundant fields
- Future-proof but not over-engineered
- Relationships clear
- Indexes planned

**Documentation:** Update `/docs/specs/data-schema.md` when schemas finalized

---

### 1.2 Module Architecture
- [x] Create `/server/features/` base structure (2025-11-22: Already exists)
- [x] Create module template files (repository/service/index) (2025-11-22)
- [x] Document service pattern in `/ARCHITECTURE.md` (2025-11-22)
- [x] Document module boundaries in `/ARCHITECTURE.md` (2025-11-22)

**Documentation:** Update `/ARCHITECTURE.md` section "Module Structure"

---

### 1.3 Database Indexes
- [x] Create `/server/db/indexes.js` (2025-11-22)
- [x] Add indexes for `layer_standards` (2025-11-22)
- [x] Add indexes for `pen_templates` (2025-11-22)
- [x] Add indexes for `tool_profiles` (2025-11-22)
- [x] Add indexes for `cassette_templates` (2025-11-22)
- [x] Add indexes for `batches` (2025-11-22)
- [x] Add indexes for `artifacts` (2025-11-22)
- [x] Document index strategy in `/ARCHITECTURE.md` (2025-11-22)

**Documentation:** Update `/ARCHITECTURE.md` section "Data Model"

---

## Phase 2: Backend Implementation

### 2.1 Foundation Services

#### Layer Standards Module
- [x] Create `/server/features/layer-standards/repository.js` (2025-11-22)
- [x] Create `/server/features/layer-standards/service.js` (2025-11-22)
- [x] Create `/server/features/layer-standards/index.js` (2025-11-22)
- [x] Create `GET /api/layer-standards` endpoint (2025-11-22)
- [x] Create seed script `/server/scripts/seed-layer-standards.js` (2025-11-22)
- [x] Schema updated for parametric templates (2025-11-22)
- [x] Seed script updated with parametric data (2025-11-22)
- [ ] Update service to handle parametric templates
- [ ] Run seed script and verify data
- [ ] Document service API in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

#### Pen Templates Module
- [ ] Create `/server/features/pen-templates/repository.js`
- [ ] Create `/server/features/pen-templates/service.js`
- [ ] Create `/server/features/pen-templates/index.js`
- [ ] Create `GET /api/templates/pens` endpoint
- [ ] Create `POST /api/templates/pens` endpoint
- [ ] Create `PUT /api/templates/pens/:id` endpoint
- [ ] Create `DELETE /api/templates/pens/:id` endpoint
- [ ] Seed default system pens
- [ ] Document service API in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

#### Tool Profiles Module
- [ ] Create `/server/features/tool-profiles/repository.js`
- [ ] Create `/server/features/tool-profiles/service.js`
- [ ] Create `/server/features/tool-profiles/index.js`
- [ ] Create `GET /api/templates/tools` endpoint
- [ ] Create `POST /api/templates/tools` endpoint
- [ ] Create `PUT /api/templates/tools/:id` endpoint
- [ ] Create `DELETE /api/templates/tools/:id` endpoint
- [ ] Seed default system tools
- [ ] Document service API in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

---

### 2.2 Core Services

#### Cassettes Module
- [ ] Create `/server/features/cassettes/repository.js`
- [ ] Create `/server/features/cassettes/service.js`
- [ ] Create `/server/features/cassettes/index.js`
- [ ] Create `POST /api/cassettes/upload` endpoint
- [ ] Create `GET /api/cassettes` endpoint
- [ ] Create `GET /api/cassettes/:id` endpoint
- [ ] Create `PUT /api/cassettes/:id/mappings` endpoint
- [ ] Create `PUT /api/cassettes/:id/parameters` endpoint
- [ ] Create `DELETE /api/cassettes/:id` endpoint
- [ ] Integrate DXF layer detection
- [ ] Integrate SVG preview generation
- [ ] Document service API in `/ARCHITECTURE.md`
- [ ] Document cassette upload workflow in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure", "API Patterns", and "Workflows"

#### Batches Module
- [ ] Create `/server/features/batches/repository.js`
- [ ] Create `/server/features/batches/service.js`
- [ ] Create `/server/features/batches/index.js`
- [ ] Create `POST /api/project/:slug/batches` endpoint
- [ ] Create `GET /api/project/:slug/batches` endpoint
- [ ] Create `GET /api/batch/:id` endpoint
- [ ] Create `PUT /api/batch/:id` endpoint
- [ ] Create `POST /api/batch/:id/nest` endpoint
- [ ] Create `GET /api/batch/:id/artifacts` endpoint
- [ ] Document service API in `/ARCHITECTURE.md`
- [ ] Document batch lifecycle workflow in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure", "API Patterns", and "Workflows"

#### Artifacts Module
- [ ] Create `/server/features/artifacts/repository.js`
- [ ] Create `/server/features/artifacts/service.js`
- [ ] Create `/server/features/artifacts/index.js`
- [ ] Create `GET /api/artifact/:id` endpoint
- [ ] Create `GET /api/artifact/:id/download` endpoint
- [ ] Integrate artifact generation with nesting worker
- [ ] Document service API in `/ARCHITECTURE.md`
- [ ] Code review & merge

**Documentation:** Update `/ARCHITECTURE.md` sections "Module Structure" and "API Patterns"

---

### 2.3 Worker Integration
- [ ] Update nesting worker to use batch system
- [ ] Update worker to generate artifacts
- [ ] Test end-to-end nesting flow
- [ ] Document worker integration in `/ARCHITECTURE.md`

**Documentation:** Update `/ARCHITECTURE.md` section "Workers"

---

## Phase 3: Frontend with PrimeVue

### 3.1 PrimeVue Setup
- [ ] Install PrimeVue packages: `npm install primevue @primevue/nuxt-module primeicons`
- [ ] Configure in `nuxt.config.js`
- [ ] Test basic PrimeVue component renders
- [ ] Document PrimeVue setup in `/ONBOARDING.md`

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

### 3.4 New Composables
- [ ] Create `/composables/layerStandards.js`
- [ ] Create `/composables/penTemplates.js`
- [ ] Create `/composables/toolProfiles.js`
- [ ] Create `/composables/batches.js`
- [ ] Document store pattern in `/ARCHITECTURE.md`

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

#### Templates Page
- [ ] Create `/pages/templates/index.vue`
- [ ] Create `PenEditor.vue` component
- [ ] Create `ToolEditor.vue` component
- [ ] Test template CRUD operations
- [ ] Document page structure in `/ONBOARDING.md`

**Documentation:** Update `/ONBOARDING.md` section "Project Structure"

#### Batch Management
- [ ] Create `/pages/project/[slug]/batches.vue`
- [ ] Create `BatchEditor.vue` component
- [ ] Create `BatchEntryEditor.vue` component
- [ ] Test batch operations
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
