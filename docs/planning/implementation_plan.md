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
- [x] Refactored to client-side layer detection (2025-11-23)
- [x] Install `dxf-parser` npm package (2025-11-23)
- [x] Create `/utils/dxfParser.js` for client-side DXF parsing (2025-11-23)
- [x] Update `CassetteEditorDialog.vue` to parse layers in browser (2025-11-23)
- [x] Update upload endpoint to accept layer mappings with file (2025-11-23)
- [x] Set cassettes to 'done' immediately (no async processing) (2025-11-23)
- [x] Remove `/api/cassettes/analyze` endpoint (obsolete) (2025-11-23)
- [x] Document client-side workflow in `/ARCHITECTURE.md` (2025-11-23)
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
- [x] Document batch lifecycle workflow in `/ARCHITECTURE.md` (2025-11-22)
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

### 3.2 UI/UX Complete Overhaul with PrimeVue

**Goal:** Replace obsolete UI with modern PrimeVue-based interface aligned to user workflows.

**Target User Workflows:**
1. **Dashboard** - View projects, quick actions, credits
2. **Assets Management** - Cassettes, pens, tools, layer standards
3. **Project Workspace** - Files, batches, nesting, artifacts
4. **User Profile** - Settings, billing, history

**Strategy:** Complete redesign focused on functionality, not incremental migration.

---

#### Phase 3.2.1: Core Layout System
**Goal:** Create new layout system with proper navigation and structure.

- [x] Create new `dashboard` layout with PrimeVue components (2025-11-23)
  - [x] Use PrimeVue `Menubar` for top navigation
  - [x] Use PrimeVue `Menu` for sidebar (collapsible)
  - [x] Add breadcrumb navigation with PrimeVue `Breadcrumb`
  - [x] Integrate `UserBalance` display in header
  - [x] Add theme switcher (dark/light)
  - [x] Mobile-responsive with hamburger menu
  
- [x] Create new `project` layout for project workspace (2025-11-23)
  - [x] Project-specific header with name and actions
  - [x] Persistent sidebar with project navigation
  - [x] Breadcrumb: Home > Projects > [Project Name]
  - [x] Quick actions toolbar
  
- [ ] Update `default` layout for landing page
  - [ ] Modern hero section with PrimeVue components
  - [ ] Replace custom buttons with PrimeVue
  - [ ] Keep minimal layout (no auth UI)
  
- [ ] Keep `auth` layout minimal (login callbacks only)

**Navigation Structure:**
```
Top Nav (Dashboard Layout):
├── Logo / Home
├── Projects (dropdown: recent + "View All")
├── Assets (dropdown: Cassettes, Pens, Tools, Standards)
├── [User Menu] (dropdown: Profile, Credits, Logout)

Project Layout Sidebar:
├── Overview
├── Files
├── Batches
├── Nesting
├── Artifacts
└── Settings
```

**Documentation:** Update `/ARCHITECTURE.md` section "Frontend Architecture - Layouts"

---

#### Phase 3.2.2: Dashboard Page (New Home)
**Goal:** Replace `/pages/home.vue` with modern dashboard.

- [x] Create `/pages/dashboard.vue` (replace home.vue) (2025-11-23)
  - [x] Use PrimeVue `Card` for sections
  - [x] Recent Projects grid with `DataView`
  - [x] Quick actions panel (New Project, Upload Cassette, Buy Credits)
  - [x] Usage statistics (Projects, Cassettes, Balance)
  
- [x] Create `/pages/index.vue` redirect logic (2025-11-23)
  - [x] Unauthenticated → Landing page
  - [x] Authenticated → Dashboard
  
- [ ] Create new landing page at `/pages/landing.vue`
  - [ ] Move current index.vue content here
  - [ ] Modernize with PrimeVue components
  - [ ] Replace all MainButton with PrimeVue Button

**Components Created:**
- [x] `DashboardStats.vue` - Statistics cards (2025-11-23)
- [x] `RecentProjects.vue` - Project grid with actions (2025-11-23)
- [x] `QuickActions.vue` - Action buttons panel (2025-11-23)
- `ActivityFeed.vue` - Recent activity list (optional v2)

**Documentation:** Update `/ONBOARDING.md` section "User Workflows"

---

#### Phase 3.2.3: Projects Hub
**Goal:** Dedicated page for managing all projects.

- [x] Create `/pages/projects/index.vue` (2025-11-23)
  - [x] Use PrimeVue `DataView` with grid/list toggle
  - [x] Filter/search with `InputText` and `Dropdown`
  - [x] Sort options (date, name, status)
  - [x] Pagination with PrimeVue `Paginator`
  - [x] Project cards show: name, date, file count, actions
  - [x] Actions: Open, Delete
  - [x] Create project dialog with optional name
  - [x] Delete confirmation dialog
  
- [ ] Create `/pages/projects/new.vue` (or dialog)
  - [x] Simple form: name, description (optional) - Implemented as dialog
  - [ ] DXF upload step (optional, can do later)
  - [x] Creates project and redirects to project workspace

**Replace:**
- Current `UserProjects` sidebar component - ✅ Replaced
- Current `home.vue` upload-first workflow - ✅ Replaced

**Documentation:** Update `/ONBOARDING.md` section "Project Management"

---

#### Phase 3.2.4: Project Workspace Redesign
**Goal:** Complete overhaul of `/pages/project/[slug].vue`

- [x] Restructure project page with new layout (2025-11-23)
  - [x] Move from tabs to sidebar navigation
  - [x] Persistent project context in header
  - [x] Use project layout (not auth layout)
  
- [x] Create `/pages/project/[slug]/index.vue` (2025-11-23)
  - [x] Project metadata, statistics
  - [x] Quick actions specific to project
  
- [ ] Update `/pages/project/[slug]/files.vue` (split from current)
  - [ ] File grid with PrimeVue `DataView`
  - [ ] Upload with PrimeVue `FileUpload`
  - [ ] File actions: View, Download, Delete
  - [ ] Show processing status with `ProgressBar`
  
- [x] Create `/pages/project/[slug]/batches.vue` (2025-11-23)
  - [x] Uses existing BatchManagement component
  - [x] Create batch dialog
  
- [ ] Create `/pages/project/[slug]/nesting.vue` (split from current)
  - [ ] Settings panel with PrimeVue form components
  - [ ] Large "Run Nesting" button with validation feedback
  - [ ] Real-time progress with `ProgressBar`
  - [ ] Error/warning messages with `Message` component
  
- [ ] Create `/pages/project/[slug]/artifacts.vue`
  - [ ] Artifact list with `DataTable`
  - [ ] Preview modal for layouts (SVG/image)
  - [ ] Download actions with `SplitButton` (PDF, DXF, G-code)
  - [ ] Filter by type and status

**Legacy:**
- Old `/pages/project/[slug].vue` moved to `/pages/project/[slug]/legacy.vue`

**Components to Refactor:**
- `ProjectFiles.vue` → Simplify, use PrimeVue
- `ProjectStatistics.vue` → Use PrimeVue `Card` and `Chart`
- `MainSettings.vue` → Rebuild with PrimeVue form components

**Documentation:** Update `/ARCHITECTURE.md` section "Workflows - Project Workflow"

---

#### Phase 3.2.5: Assets Management Pages
**Goal:** Centralized asset management hub.

- [ ] Create `/pages/assets/index.vue` (hub page)
  - [ ] Tabbed interface: Cassettes, Pens, Tools, Standards
  - [ ] Or separate pages with shared layout
  
- [ ] Update `/pages/cassettes.vue` → `/pages/assets/cassettes.vue`
  - [ ] Already uses PrimeVue (mostly done)
  - [ ] Add filter/search functionality
  - [ ] Add bulk actions (delete, export)
  - [ ] Polish card layout and empty states
  
- [ ] Update `/pages/templates/index.vue` → `/pages/assets/library.vue`
  - [ ] Already uses PrimeVue (mostly done)
  - [ ] Combine pens and tools in one page
  - [ ] Add layer standards viewer (read-only)
  - [ ] Add import/export functionality

**Navigation:**
```
Assets Section:
├── Cassettes (user-created templates)
├── Library (pens, tools, standards)
└── Import/Export (optional v2)
```

**Documentation:** Update `/ARCHITECTURE.md` section "Workflows - Asset Management"

---

#### Phase 3.2.6: User Profile & Settings
**Goal:** Modern profile page with PrimeVue components.

- [ ] Update `/pages/profile.vue`
  - [ ] Use PrimeVue `TabView` for sections
  - [ ] Account tab: Avatar, name, email (read-only), OAuth providers
  - [ ] Billing tab: Credit balance, purchase history, buy credits
  - [ ] Preferences tab: Theme, language, notifications
  - [ ] Projects tab: Usage stats, storage info
  
- [ ] Update `BuyCreditsDialog.vue`
  - [ ] Use PrimeVue `Dialog` and form components
  - [ ] Package selection with `SelectButton`
  - [ ] Payment integration (keep existing Stripe logic)

**Components to Update:**
- `UserBalance.vue` → Simplify with PrimeVue `Tag` or `Badge`
- `BuyCreditsDialog.vue` → Rebuild with PrimeVue components
- `Avatar.vue` → Keep or replace with PrimeVue `Avatar`

**Documentation:** Update `/ONBOARDING.md` section "User Management"

---

#### Phase 3.2.7: Component Cleanup & Removal
**Goal:** Remove obsolete custom components after migration.

**Components to Remove (after replacing all usages):**
- [ ] `MainButton.vue` → Replaced by PrimeVue `Button`
- [ ] `InputField.vue` → Replaced by PrimeVue `InputText`
- [ ] `MainTitle.vue` → Use native `<h1>` with Tailwind
- [ ] `MainAside.vue` → Replaced by PrimeVue `Sidebar`
- [ ] `DialogWrapper.vue` → Replaced by PrimeVue `Dialog`
- [ ] `UserProjects.vue` → Functionality moved to `/pages/projects`
- [ ] `UserResults.vue` → Functionality moved to artifacts page
- [ ] `DxfUpload.vue` → Replaced by PrimeVue `FileUpload`

**Components to Keep:**
- [x] `Tabs.vue` (if still needed, or replace with PrimeVue `TabView`)
- [x] `TableEditor.vue` (specialized, keep for now)
- [x] `SvgDisplay.vue` (specialized)
- [x] `Footer.vue` (update styling)
- [x] `LanguageSwitcher.vue` (keep)

**Process:**
1. For each component, search for all usages
2. Replace with PrimeVue equivalent
3. Test functionality
4. Delete obsolete component file
5. Update documentation

**Documentation:** Update `/ONBOARDING.md` section "Component Library"

---

#### Phase 3.2.8: Polish & Consistency
**Goal:** Final touches for production-ready UI.

- [ ] Consistent spacing and sizing (use PrimeVue design tokens)
- [ ] Loading states with PrimeVue `Skeleton` and `ProgressSpinner`
- [ ] Empty states with icons and helpful messages
- [ ] Error states with PrimeVue `Message` component
- [ ] Toast notifications with PrimeVue `Toast`
- [ ] Confirmation dialogs with PrimeVue `ConfirmDialog`
- [ ] Dark mode works perfectly (test all pages)
- [ ] Mobile responsive (test all breakpoints)
- [ ] Accessibility (ARIA labels, keyboard navigation)

**Documentation:** Update `/ONBOARDING.md` section "UI Guidelines"

---

### 3.2.9: Migration Checklist

**Before starting:**
- [x] PrimeVue installed and configured
- [ ] New layouts created (dashboard, project)
- [ ] Navigation structure designed
- [ ] Component inventory complete

**During migration:**
- [ ] Create new pages in parallel (don't break existing)
- [ ] Test each page thoroughly before switching routes
- [ ] Update routing progressively
- [ ] Keep old components until fully replaced

**After migration:**
- [ ] Remove obsolete components
- [ ] Clean up unused imports
- [ ] Update all documentation
- [ ] Perform full regression testing
- [ ] Get user feedback

**Documentation:** Mark tasks in this plan as complete

---

### 3.3 PrimeVue Complex Components (DEPRECATED - See 3.2 for new plan)

**Note:** This section is superseded by Phase 3.2 UI/UX Complete Overhaul.

#### Data Display Components
- [ ] Replace custom `TableEditor` with PrimeVue `DataTable`
- [ ] Add inline editing with DataTable row editing
- [ ] Test pagination, sorting, filtering
- [ ] Document DataTable patterns

#### Dialog Components  
- [ ] Replace custom modals with PrimeVue `Dialog`
- [ ] Update all dialog state management to use `v-model:visible`
- [ ] Test modal backdrop and ESC key handling

#### File Upload
- [ ] Evaluate PrimeVue `FileUpload` vs existing custom solution
- [ ] If suitable, migrate file upload components
- [ ] Test FormData submission with GridFS

#### Tab Navigation
- [ ] Keep existing `Tabs` component (already working well)
- [ ] Or migrate to PrimeVue `TabView` if needed
- [ ] Update project page tabs

**PrimeVue Components:**
```vue
<DataTable :value="data" editMode="row" @row-edit-save="onSave">
  <Column field="name" header="Name" />
</DataTable>

<Dialog v-model:visible="showDialog" header="Title">
  <template #footer>
    <Button label="Save" @click="save" />
  </template>
</Dialog>

<FileUpload mode="basic" accept=".dxf" @select="onSelect" />
```

**Documentation:** Update `/ONBOARDING.md` section "PrimeVue Components"

---

### 3.4 New Composables ✅ COMPLETE
- [x] Create `/composables/layerStandards.js` (2025-11-22)
- [x] Create `/composables/penTemplates.js` (2025-11-22)
- [x] Create `/composables/toolProfiles.js` (2025-11-22)
- [x] Create `/composables/batches.js` (2025-11-22)
- [x] Document store pattern in `/ARCHITECTURE.md` (2025-11-22)

**Documentation:** Update `/ARCHITECTURE.md` section "Frontend Architecture"

---

### 3.5 New Pages with PrimeVue

#### Cassettes Page
**Goal:** Manage user cassette templates with PrimeVue components

- [x] Update `/pages/cassettes/index.vue` to use PrimeVue (2025-11-22)
- [x] Migrate `CassetteManager.vue` to PrimeVue DataView (2025-11-22)
- [x] Update `CassetteEditorDialog.vue` to use PrimeVue components (2025-11-22)
- [x] Fix cassettes store reactivity issue (2025-11-22)
- [x] Fix auth check in GET /api/cassettes/[id] (2025-11-22)
- [x] Implement layer mapping UI with MultiSelect (2025-11-22)
- [x] Add analyze endpoint for DXF layer detection (2025-11-22)
- [x] Add upload endpoint with layer mappings (2025-11-22)
- [x] Fix cassettes getter name (allCassettes) (2025-11-22)
- [ ] Add locales for new cassette UI strings
- [ ] Implement SVG preview display in dialog
- [ ] Polish cassette card display
- [ ] Create `ParameterEditor.vue` with PrimeVue form components
- [ ] Test cassette CRUD operations end-to-end
- [ ] Document page structure in `/ONBOARDING.md`

**Known Issues:**
- Layer detection returns mock data (will be fixed with Python worker integration in Phase 3)
- SVG preview not fetching from GridFS yet
- Some UI strings not localized

**PrimeVue Components to Use:**
- `DataTable` with `Column` for cassette list
- `Dialog` for upload/edit modals
- `FileUpload` for DXF uploads
- `Dropdown` for layer standard selection
- `InputNumber` for parameter values

**Documentation:** Update `/ONBOARDING.md` section "Project Structure"

#### Templates Page ✅ COMPLETE
- [x] Create `/pages/templates/index.vue` (2025-11-22)
- [x] Tabbed interface for Pens and Tools (2025-11-22)
- [x] Full CRUD with PrimeVue components (2025-11-22)
- [x] Test template CRUD operations (2025-11-22)
- [x] Document page structure in `/ONBOARDING.md`

**PrimeVue Components Used:**
- `TabView` with `TabPanel` for pen/tool tabs
- `DataTable` for template lists
- `Dialog` for create/edit forms
- `ColorPicker` for pen colors
- `InputNumber` for tool dimensions

**Documentation:** Update `/ONBOARDING.md` section "Project Structure"

#### Batch Management ✅ COMPLETE
- [x] Create `/pages/project/[slug]/batches.vue` (integrated into project tabs) (2025-11-22)
- [x] Create `BatchManagement.vue` component (2025-11-22)
- [x] Create `BatchEditor.vue` component (via BatchManagement dialog) (2025-11-22)
- [x] Create `BatchEntryEditor.vue` component (2025-11-22)
- [x] Test batch operations (2025-11-22)
- [ ] Document page structure in `/ONBOARDING.md`

**PrimeVue Components Used:**
- `DataTable` with inline row editing for batch entries
- `Dialog` for batch creation and editing
- `Dropdown` for cassette template selection
- `InputNumber` for quantities and dimensions
- `Tag` for status display
- `Button` with icons for actions

**Documentation:** Update `/ONBOARDING.md` section "Project Structure"
- [x] Create `BatchEditor.vue` component (via BatchManagement dialog) (2025-11-22)
- [x] Create `BatchEntryEditor.vue` component (2025-11-22)
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

---

## Progress Summary (Last Updated: 2025-11-22)

### Overall Status: 70% Complete

**Phase 1: Architecture Foundation** ✅ 100% COMPLETE
- Data schemas finalized and documented
- Module structure created with repository/service pattern
- Database indexes defined and documented

**Phase 2: Backend Implementation** ✅ 85% COMPLETE
- Foundation Services (Layer Standards, Pens, Tools) ✅ 100%
- Core Services (Cassettes, Batches, Artifacts) ✅ 100%
- Worker Integration ⏳ 50% (endpoints ready, worker updates pending)

**Phase 3: Frontend with PrimeVue** 🔄 40% COMPLETE (Updated 2025-11-23)
- PrimeVue Setup ✅ 100%
- UI/UX Complete Overhaul 🔄 20%
  - Phase 3.2.1: Core Layout System ✅ 85% (dashboard & project layouts done)
  - Phase 3.2.2: Dashboard Page ✅ 85% (page & components done, landing pending)
  - Phase 3.2.3: Projects Hub ✅ 100% (grid/list views, search, sort, CRUD)
  - Phase 3.2.4: Project Workspace ⏳ 0%
  - Phase 3.2.5: Assets Management ⏳ 20% (pages exist, need polish)
  - Phase 3.2.6: Profile & Settings ⏳ 0%
  - Phase 3.2.7: Component Cleanup ⏳ 0%
  - Phase 3.2.8: Polish & Consistency ⏳ 0%
- New Composables ✅ 100%

**Phase 4: Integration & Testing** ⏳ 0% PENDING

**Phase 5: Deployment** ⏳ 0% PENDING

### What's Working
- ✅ All backend API endpoints (38+)
- ✅ Service layer architecture
- ✅ Database seeding scripts
- ✅ PrimeVue component library
- ✅ Readonly reactive stores
- ✅ Templates page with full CRUD
- ✅ Batch management UI

### What's Pending
- ⏳ Worker integration (DXF processing, SVG generation)
- ⏳ Complete UI/UX overhaul with PrimeVue (comprehensive plan created)
  - New layout system (dashboard, project)
  - Dashboard page replacing upload-first flow
  - Projects hub for management
  - Project workspace redesign
  - Assets management centralization
- ⏳ End-to-end testing
- ⏳ Workflow documentation
- ⏳ Deployment setup

### Ready for Next Steps
The backend is production-ready and can support frontend development in parallel with worker integration work.

