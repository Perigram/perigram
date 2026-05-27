# Dynamic & Composable UI Implementation Plan

This plan outlines the transition from a unified contractor-centric UI to a dynamic, atomic feature-based system that adapts to granular permissions and organization types.

## 🎨 Core UI Principles
- **PrimeVue First:** Rely 100% on PrimeVue 4 components and the `Re_L` preset styling.
- **Zero Custom CSS:** Use Tailwind utility classes only when strictly necessary for layout. Avoid custom SCSS/CSS blocks in components.
- **Dynamic Composition:** UI elements (Tabs, Nav links, Buttons) are rendered based on `hasPermission` or `orgType` checks.
- **Localization:** All new labels, access presets, and feature names must be localized in `i18n/locales/*.json`.

---

## 📅 Implementation Phases

### Phase 1: Foundation & Atomic State [ ]
- [ ] **Enhance `useAuthStore` (`stores/auth.js`):**
    - Add `organization` state and fetch it in `setUser()`.
    - Implement `hasPermission(entity, level)` logic.
    - Add computed flags based on organization type and explicit permission grants.
- [ ] **Localization (`i18n/locales/`):**
    - Add `roles.*` and `features.*` namespaces to `en.json` and `ru.json`.
- [ ] **Documentation:** Update `stores/README.md` to reflect state changes.

### Phase 2: Dynamic Navigation & Breadcrumbs [ ]
- [ ] **Refactor `layouts/app.vue`:**
    - Convert `mainSections` into a computed property filtering by permission.
    - Update breadcrumb generator to use dynamic `mainSections`.
    - Update user menu to show "System Admin" or "Org Admin" sections conditionally.
- [ ] **Documentation:** Update `layouts/README.md`.

### Phase 3: Composable Feature Hubs [ ]
- [ ] **Materials Hub (`pages/materials/index.vue`):**
    - Dynamically render tabs (`Warehouses`, `Catalogs`, `Requisitions`, `Batches`, `Sheets`, `Remnants`) based on `orgType`.
- [ ] **Polymorphic Requisitions (`components/materials/RequisitionsTab.vue`):**
    - Adapt table columns and actions for Manufacturer (Supply side) vs Contractor (Demand side).
- [ ] **Project Views:**
    - Add read-only guards from explicit permission grants in project pages.

### Phase 4: Org & User Management [ ]
- [ ] **Team Management (`pages/organization/users.vue`):**
    - New page for organization administrators to invite users and manage access presets within their organization.
- [ ] **Permission Editor:**
    - Ensure `PermissionEditor.vue` is integrated into the user management flow.
- [ ] **Admin Views:**
    - Refactor `admin/organizations.vue` and `admin/users.vue` to use dynamic feature sets.

### Phase 5: Routing & Guards [ ]
- [ ] **Middleware Guard (`middleware/auth.js`):**
    - Implement route-level feature permission validation.
- [ ] **Final Polish:**
    - Ensure all components use PrimeVue default styling and `Re_L` design tokens.

---

## 📈 Progress Tracking
- **Phase 1: Foundation**: 100%
- **Phase 2: Navigation**: 100%
- **Phase 3: Feature Hubs**: 100%
- **Phase 4: Management**: 100%
- **Phase 5: Routing**: 0%
