# Cutkit System Rework - Implementation Plan

**Version:** 2.2 (Standardized v24 Architecture)  
**Target:** Robust, multi-tenant manufacturing platform  
**Date:** 2026-03-09

---

## v24 FINAL STANDARDIZATION (March 2026)

This section documents the approved hardening of the v24 Absolute Final architecture to ensure clean, decoupled, and enforceable implementation by all coding agents.

### Phase 1: Backend Hardening & "Golden Path" (COMPLETE)
**Objective:** Establish canonical patterns and automated guardrails.

#### 1.1. Modular Core Blocks
- **Location:** `server/core/blocks/`
- **Identity.js**: Unified identification (uid, name, slug, serial, reference).
- **Status.js**: Immutable state snapshot with 'SYSTEM' fallback for legacy data.
- **Lineage.js**: Flat, cumulative ancestry trace.
- **Specs.js**: Standardized physical DNA (dimensions, area).
- **BaseEntity.js**: Root class integrating all blocks with `toJSON()` serialization.

#### 1.2. The Golden Path Template
- **Location:** `server/features/_template/`
- Canonical Model-Repository-Service pattern.
- **Rules:**
  - Services return `toJSON()` results.
  - Repositories use `toFlexibleId()` for ALL lookups.
  - Services register with central registry for side-effects.

#### 1.3. Automated Guardrail (`scripts/check-arch.js`)
- Script that verifies every feature module against the Golden Path.
- Mandatory for all agents.

### Phase 2: API -> UI Contract (IN PROGRESS)
**Objective:** Frontend blind trust in the Data Model.

#### 2.1. Standardized DTOs
- Every API endpoint MUST return results from `Model.toJSON()`.
- Ensures consistent property names (e.g., `id` AND `_id`) across the system.

#### 2.2. Unified Entity Composable (`composables/useEntity.js`)
- Create a standard reactive bridge for fetching and interacting with v24 entities.
- Handles ID normalization and block unwrapping.

### Phase 3: Traceability UI System
**Objective:** Replace manual UI with atomic standard blocks.

#### 3.1. Atomic Components (`components/shared/blocks/`)
- `StatusBadge.vue`, `IdentityBlock.vue`, `LineageBreadcrumbs.vue`.
- Use Slots pattern for layout consistency.

#### 3.2. Reference Chains
- Implement `TraceLink` and `TraceChain` from `TRACEABILITY_UI_PLAN.md`.

### Phase 4: Constitutional Guardrails
**Objective:** Update documentation to prevent regression.

- Update `AGENTS.md` with explicit "Golden Path" mandates.
- Update `NEOLIT.md` at all levels to reflect the modularized core.

---

## Original Implementation Plan (v2.1)

[... see historical versions for details on Auth Foundation, Material Tracking, and Core Migration ...]
