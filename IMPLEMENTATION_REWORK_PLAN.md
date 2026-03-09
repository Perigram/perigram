# v24 Engineering Rework: Implementation Plan

This document tracks the progress of the full-system rework to align with the **v24 Absolute Definitive Model**.

## Status Legend
- ⚪ Not Started
- 🟡 In Progress
- 🟢 Completed
- 🔴 Blocked

---

## Phase 1: Core Logic Engines (The Foundation)
Goal: Establish the centralized "brains" of the system.

- [🟢] **1.1. Standard Blocks Utility**: Create `server/utils/blocks.js` for Identity, Status, Origin, Lineage, and Specs.
- [🟢] **1.2. State Machine Framework**: Declarative machine definitions and centralized runner in `server/core/machines/`.
- [🟢] **1.3. Lineage-Aware Permissions**: Integrate `memberships` and lineage-based access control into `server/utils/permissions.js`.
- [🟢] **1.4. Generic Status Hook System**: Allow state transitions to trigger cross-entity updates (e.g., Summary updates).

---

## Phase 2: Backend Refactor (The Nervous System)
Goal: Update all 19 collections to use the new standardized blocks.

- [🟢] **2.1. Project & Queue Services**: Implementation of the "Nesting Job" job block.
- [🟢] **2.2. Physical Tracking Logic**: Refactor Piles, Sheets, and Instances with physical/digital lineage bridge.
- [🟢] **2.3. Master Data Consolidation**: Update Catalogs, Colors, and Layer Standards.
- [🟢] **2.4. Universal Artifacts**: Generic file storage pointing to any lineage ID.
- [🟢] **2.5. Data Migration Script**: Tool to transform legacy documents into v24 block structure.

---

## Phase 3: Frontend Architecture (The Presentation Logic)
Goal: Create universal composables to handle the new data structures.

- [🟢] **3.1. Block Composables**: `useIdentity`, `useStatus`, `useLineage`, `useSpecs`.
- [🟢] **3.2. Status Controller**: Frontend bridge for the State Machine engine.
- [🟢] **3.3. Variant Registry**: Define standard CSS classes and behaviors for Inline, Compact, Card, and Full variants.

---

## Phase 4: Component Rework (The Interface) (COMPLETE)
Goal: Replace all existing entity views with standardized, multi-variant components.

- [🟢] **4.1. Core Production Components**: Project, Queue, NestingRun, Design, Instance.
- [🟢] **4.2. Material Components**: Pile, Sheet, Remnant.
- [🟢] **4.3. Navigation & Context**: Lineage TraceChains and Global Identity Headers.
- [🟢] **4.4. Unified Status History**: Rich history component reading from `status_events`.

---

## Phase 5: Verification & UI-Lab
Goal: Ensure the system is "industrial grade."

- [🟢] **5.1. UI-Lab Update**: Living documentation for all block-based components.
- [⚪] **5.2. Integration Tests**: Verify state transitions and lineage-based permission guards.
- [⚪] **5.3. Performance Audit**: Ensure single-index lineage queries meet latency targets.
