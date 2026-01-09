# SYSTEM: Cutkit-Demo

Cutkit-Demo is a professional DXF nesting application for CNC manufacturing. It allows users to upload parametric cassette templates, organize them into production batches, and run nesting algorithms to generate optimal material layouts, G-code, and PDF reports.

## Tech Stack
- **Frontend:** Nuxt.js 3 (SSR), Vue 3, PrimeVue, Tailwind CSS
- **Backend:** Nuxt Nitro (Node.js), MongoDB (native driver), GridFS for file storage
- **Workers:** Python-based workers for DXF processing and nesting (using jagua-rs)
- **Deployment:** Docker & Docker Stack

## Core Architecture
The system follows a modular architecture with a clean separation between the API/Frontend (Nuxt) and the processing units (Workers).

### Data Model (v2 Target)
- `layer_standards`: System layer catalogue.
- `pen_templates`: Display styles for layers.
- `tool_profiles`: CNC tool library.
- `cassette_templates`: Parametric templates with layer mappings.
- `batches`: Production runs with specific quantities and parameters.
- `artifacts`: Unified outputs (layouts, G-code, PDFs).
- `projects`: Extended with metadata and statistics.
- `users`: User accounts and template libraries.

### Containers
- **Web App (Nuxt):** Handles UI, user management, and business logic orchestration.
- **Nesting Worker:** Python service that polls the database for nesting jobs and executes the nesting algorithm.
- **File Processing Worker:** Legacy service for DXF to SVG conversion.
- **MongoDB:** Primary data store and file storage (GridFS).

## Key Workflows
1. **Cassette Management:** Users upload DXF files, map layers to system standards, and define parametric variables.
2. **Batch Production:** Users create batches by selecting cassettes, specifying quantities, and providing parameter values.
3. **Nesting Execution:** The system generates a nesting job, which is picked up by the Nesting Worker to produce artifacts (SVG, DXF, G-code).

## Components List
See details in sub-directories:
- [server/features](./server/features/NEOLIT.md) - Core business logic modules.
- [workers](./workers/NEOLIT.md) - Specialized processing units.
- [composables](./composables/NEOLIT.md) - Frontend state management.

## Deployment & Ops
See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for Docker stack setup, environment configuration, and monitoring strategies.
