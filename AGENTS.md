# AGENTS.md

In this project, coding agents work in strict documentation-first mode and follow some mandatory rules. Following rules must be internalized and followed strictly by all coding agents working on this project, so if you are an AI agent, read and understand them fully before proceeding.

NEOLIT.md documentation files are created at different places in the project and contain information about the code in that directory. It's purpose is to help humans and AI agents understand, maintain, and extend the codebase without need for deep code analysis, guesses, grepping, etc. On other hand, documentation should not overwhelm with unnecessary details or duplicate self-evident information.

---

# Documentation Workflow 
C4 levels are used internally to interpret the scope and detail of NEOLIT.md documentation files.

## When to Use Each Level

### SYSTEM Level (always)
- **Location:** Project root
- **Use:** Every project has one SYSTEM level NEOLIT.md
- **Purpose:** Project overview, tech stack and conventions, containers/components list, critical project-wide workflows and data flows

### CONTAINER Level (optional)
- **Location:** Separately deployable unit directories (api/, worker/, frontend/)
- **Use ONLY when:**
  - Multiple separately deployable units (microservices)
  - Each unit runs independently
  - Example: API server, worker service, frontend app
- **Skip when:**
  - Single deployable application
  - Just source code directories (src/)

### COMPONENT Level (always)
- **Location:** Functional unit directories (src/auth/, api/users/)
- **Use:** For every functional component
- **Purpose:** Detailed architecture + implementation helping understand, maintain and extend the component

### CODE Level (optional)
- **Location:** Sub-component directories (src/auth/utils/)
- **Use ONLY when:**
  - Sub-component has 3+ files
  - Complex logic needs documentation
- **Skip when:**
  - Simple utilities
  - Self-explanatory code

## Document Component Guide (read when creating or modifying NEOLIT.md)

NEOLIT.md file should contain accurate, concise information about the code in that directory. It's purpose is to help humans and AI agents understand, maintain, and extend the codebase, not to overwhelm with unnecessary details or to duplicate self-evident information.

### Step 1: Determine C4 Level

**Quick check:**
- Root directory → SYSTEM
- Separately deployable (api/, worker/) → CONTAINER (optional)
- Functional component (src/auth/) → COMPONENT (most common)
- Sub-component (src/auth/utils/) → CODE (optional, if 3+ files)

### Step 2: Identify Scope

Depending on level and system architecture, determine:
- Core files
- Tech stack
- Entry points
- Dependencies
- Key functions/classes
- Data structures
- Data flows
- Patterns and conventions
- Workflows

### Step 3: Create NEOLIT.md

Read actual folders and code files in the directory.
Write information extracted from code, that would help understand, maintain and extend it. Need only relevant info in readable understandabe format, no guesses, no obvious details, no placeholders, no self-explanatory parts such as schema/structure duplicates (but include references and links). Can use mermaid diagrams, tables, plain text, checklists, etc. Main goal is clarity and completeness.
What to extract from code is dependending on multiple factors such as C4 level, system architecture, technology stack, coding patterns and conventions used in the project. But generally, extract fundamental information and avoid trivial details. If found something unusual or complex, document it. Remember to keep it concise and to the point, avoiding unnecessary verbosity, examples and duplicating what is already obvious from code.

### Step 4: Add Cross-Links

Add links to file, find and update related NEOLIT.md files:
- Parent level → add to components list
- Related components → add to Related section
- System workflows → add references if used

---

## Tasks Workflow

### Phase 0: Verify Docs Exist

When starting a new task, first verify that NEOLIT.md documentation files exist at all required levels (SYSTEM in project root and local COMPONENT where code change is needed) and contain all required information (data structures, flows, APIs, links to NEOLIT files in related components) so that you don't need to guess, grep, or hallucinate anything.
If any NEOLIT.md is missing or incomplete, create or update it first using "Document Component Guide" above.

### Phase 1: Context Assembly

- Read relevant NEOLIT.md files to assemble full context for the task - data structures, patterns, APIs, flows, technologies involved.
- Read code parts that are directly related to the task.
- If NEOLIT.md doesn't match code, update it using "Document Component Guide" above.

### Phase 2: Implement

1. Complete task FULLY (no placeholders, TODOs, or "later" comments)
2. Implement error handling and edge cases
3. Move to WAITING status (not DONE, so reviewer can verify)
4. Change ONLY what task requires
5. Must not refactor unrelated code or fix unrelated bugs
6. Follow existing structures, patterns, conventions, APIs
7. Do not modify structures and flows without explicit task requirement
8. Do not run npm build or dev servers

### Phase 3: Documentation Synchronization

1. Update NEOLIT.md when changing implementation or adding/removing features (use "Document Component Guide" above)
2. Write execution log in Agent Notes format under TODO.org task:
    ```org
    *** Agent Notes
         [YYYY-MM-DD] Task description
         Files changed: file1.js, file2.js
         Docs updated: NEOLIT.md (COMPONENT level)
         Notes: key decisions, patterns used
    ```

### Phase 4: Commit Strategy

1. Commit code changes first with message starting with "feat:", "fix:", etc. as appropriate
2. Commit documentation separately from code (any TODO.org(_archive) or NEOLIT.md should go in separate commit with "neo: ..." prefix)
3. If project uses "local" branch, use only it. Do not commit directly to main or other branches.
4. Do not revert commits or modify git history unless explicitly instructed.
5. Pay attention to unstaged changes before committing - they can contain changes done by user or other agents.

---

# Technical Constraints

## Backend Pattern: v24 Golden Path
Location: `server/features/[module]/`

All features must strictly follow the directory structure and implementation rules defined in `server/features/_template/README.md`.

### The Core Rules:
1.  **Architecture Verification**: Every backend task is considered incomplete until `node scripts/check-arch.js` passes with zero errors.
2.  **Flexible IDs**: Always use `toFlexibleId()` in Repositories to support both string UIDs and ObjectIds.
3.  **No Raw Database in Services**: Services must never use `db.collection`. All data access must go through the Repository.
4.  **Decoupled Hooks**: Do not add business logic to `server/core/machines/hooks.js`. Register feature hooks in the Service Layer using `registerService`.
5.  **Standardized Blocks**: Use the classes from `server/core/blocks/` (`Identity`, `Status`, `Lineage`, `Specs`) via `BaseEntity`.
6.  **Serialized Outputs**: Services must return results from `Model.toJSON()`.

## Frontend Pattern: v24 Absolute Final
Location: `composables/`, `components/shared/`

All frontend features must strictly adhere to the standardized interaction layer.

### The Core Rules:
1.  **Unified Interaction**: Use `useEntity(type, id)` for all entity-specific data fetching, updates, and status transitions. Do NOT use manual `$fetch` calls for standard CRUD or status operations.
2.  **Standardized Visualization**:
    - Use `EntityStatus` for all interactive status displays and transitions.
    - Use `StatusBadge` for atomic, read-only status display.
    - Use `TraceChain` for all lineage and ancestry visualization.
    - Use `StatusHistory` for audit logs and lifecycle timelines.
3.  **Atomic Blocks**: Use `IdentityBlock` for name/slug/serial display to ensure consistent layout across the application.
4.  **Zero Styling Policy**: Rely on PrimeVue's unstyled components and the global theme. Avoid manual CSS for colors, spacing, and typography; use semantic layout containers instead.
5.  **Reactive Block Unwrapping**: Leverage the computed properties provided by `useEntity` (e.g., `name`, `statusColor`, `lineage`) instead of manually drilling into the `entity.value` object.

## Critical Conventions
- **User IDs:** Authenticated user IDs (`userId`) are strings (OAuth IDs), not MongoDB ObjectIds.
- **Data Access:** No cross-module DB access (use service calls).
- **Documentation Rule:** Every code change MUST update relevant NEOLIT.md docs in the same task session.


