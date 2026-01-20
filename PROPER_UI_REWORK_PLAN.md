# 🛠️ Proper UI Rework & System Architecture Plan

## 1. System Architecture Diagram

```mermaid
graph TD
    %% Roles and Organizations
    SA[Super Admin] -- Manages --> ORG[Organization]
    ORG -- Type: Manufacturer --> MNF[Manufacturer]
    ORG -- Type: Contractor --> CTR[Contractor]
    ORG -- Type: Customer --> CST[Customer]

    MNF -- Owns --> CAT[Catalog]
    MNF -- Owns --> M_WH[Manufacturer Warehouse]
    CTR -- Owns --> PRJ[Project]
    CTR -- Owns --> C_WH[Contractor Warehouse]
    CST -- Views --> PRJ

    %% Material Lifecycle Flow
    CAT -- Defines Sheets --> REQ[Requisition Order]
    CTR -- Creates --> REQ
    REQ -- Approved by --> MNF
    MNF -- Sends --> BTC[Batch]
    BTC -- Contains --> PIL[Pile]
    PIL -- Received in --> C_WH
    
    %% Production Flow
    PRJ -- Has --> QUE[Queue]
    QUE -- Uses --> PIL
    PIL -- Creates --> SHT[Sheet]
    SHT -- Cut into --> CAS[Cassette Instance]
    SHT -- Leaves --> REM[Remnant]
    REM -- Stored in --> C_WH
    
    %% Status & Tracking
    CAS -- Lifecycle --> ST[Nested -> Manufactured -> On-Site -> Installed]
    
    %% Relationships
    SHT -- Link --> SD[Sheet Design / Nesting Layout]
    SD -- References --> CD[Cassette Design]
    CD -- Based on --> TPL[Cassette Template]
```

## 2. Core UI Principles (Updated)
- **PrimeVue Defaults:** Use standard PrimeVue 4 components out-of-the-box. Avoid deep `pt:` overrides or custom Tailwind complex classes unless structural.
- **Minimal CSS:** Zero custom SCSS/CSS blocks in components. Rely on the global `Re_L` preset for all styling.
- **State Management:** Use existing Pinia store patterns (`stores/auth.js`, `stores/global.js`). Avoid introducing new complex reactivity patterns if existing ones suffice.

## 3. Global User Roles & Dashboards (Detailed)



| Role | Access Level | Primary Dashboard Elements | Main Navigation | Permissions (Entity:Level) |

| :--- | :--- | :--- | :--- | :--- |

| **Super Admin** | System-wide | Org health, Total usage, Active Users | Organizations, System Users, Global Settings | `*:admin` |

| **Manufacturer Admin** | Org-wide | Pending Requisitions, Catalog performance, Batch fulfillment status | Materials (Catalogs, Requisitions, Warehouses, Batches), Team | `catalog:admin`, `requisition:admin`, `batch:admin`, `warehouse:admin`, `team:admin` |

| **Contractor Admin** | Org-wide | Project deadlines, Material stock alerts, Requisition status | Projects, Materials (Warehouses, Requisitions, Remnants), Assets (Templates, Tools), Billing, Team | `project:admin`, `requisition:write`, `warehouse:admin`, `asset:admin`, `billing:admin`, `team:admin` |

| **Customer Admin** | Org-wide | Project progress, Delivery timelines | Projects (Read-only), Profile | `project:read`, `profile:write` |



## 4. Entity Relationship & Lifecycle Tracking



### Lifecycle Stages

- **Requisition:** `Draft` -> `Submitted` -> `Approved/Rejected` -> `In Fulfillment` -> `Fulfilled`

- **Batch:** `Pending` -> `In Transit` -> `Received`

- **Sheet:** `Stock` -> `Allocated` -> `In Production` -> `Consumed` -> `Remnant`

- **Cassette:** `Design` -> `Nested` -> `Manufactured` -> `On-Site` -> `Installed`



### Relationship UI

- Visual indicators of "Where is my material?" (Requisition -> Batch -> Pile -> Sheet).

- "Ancestry" tracking for Remnants (Source Sheet -> Remnant Sheet).

- Project-to-Cassette mapping via Queues.



## 5. Implementation Roadmap



### Phase 1: Foundation & Navigation

- [ ] **Auth Store Sync:** Ensure role-based computed flags in `stores/auth.js` accurately drive UI visibility.

- [ ] **Dynamic Navigation Composing:** Refactor `stores/navigation.js` to use a declarative permission-based approach for hub and sub-menu generation.

- [ ] **Unified Layout:** Refactor `layouts/app.vue` navigation to use simple Hub-based grouping.

- [ ] **Permissions:** Apply standard `v-if="authStore.hasPermission(...)"` guards.



### Phase 2: Materials Hub (Dynamic Tabs)

- [ ] **Polymorphic Tabs:** Use `TabView` in `pages/materials/index.vue` to show appropriate features per role.

- [ ] **Requisition Loop:** Implement standard Table/Dialog interactions for Orders with status tracking.

- [ ] **Warehouse Tracking:** Simple list/grid views of Piles and Remnants with relationship links.



### Phase 3: Production Flow & Lifecycle

- [ ] **Queue Management:** Transition "Batch" UI terminology to "Queue".

- [ ] **Lifecycle UI:** Add status badges and timeline components for Cassettes and Requisitions.

- [ ] **Instantiation UI:** Simple status updates for Cassette Instances.



### Phase 4: Team Management & Org

- [ ] **Member Lists:** Standard Datatables for managing organization users.

- [ ] **Organization Editor:** UI for Super Admins to manage Orgs and types.
