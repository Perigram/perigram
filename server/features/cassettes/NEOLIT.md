# COMPONENT: Cassettes Feature (v24 Standardized)

Manages cassette templates (Standard DXF and Parametric) using standardized v24 architecture.

## Core Files
- `repository.js`: Database operations on `cassettes` collection.
- `service.js`: CRUD logic, DXF extraction, and lineage-based permission handling.

## Data Structure (v24)
Cassettes use the standardized block architecture:

- **`identity`**: `{ name, slug }`
- **`status`**: Current lifecycle state (DRAFT, ACTIVE, ARCHIVED).
- **`origin`**: Creation snapshot.
- **`lineage`**: `{ organizationId }` (or userId for individual templates).
- **`definition`**:
    - `type`: `STANDARD` | `PARAMETRIC`
    - `data`: Geometry logic (for parametric) or file references.
    - `parameters`: Configurable dimensions for parametric evaluation.

## Key Workflows

### Permission Model
Cassette access is strictly controlled via `lineage`. Templates belong to an `organizationId`. If a user is not in an organization, the `organizationId` stores their `userId` for individual ownership.

### State Transitions
Managed via the `cassette` state machine. Transitions between `DRAFT` and `ACTIVE` ensure templates are ready for production use.

## API Integration
The service uses `hasLineagePermission` for all operations, ensuring multi-tenant isolation even for individual users.

## Related
- [parametric-cassettes](../parametric-cassettes/NEOLIT.md) - Evaluation engine.
- [layer-standards](../layer-standards/NEOLIT.md) - Source for interpretation rules.
