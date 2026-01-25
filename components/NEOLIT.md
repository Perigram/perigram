# COMPONENT: Components

This directory contains Vue components used in the Cutkit-Demo application.

## Style Guide
- Where not absolutely necessary, avoid using custom css, rely on PrimeVue default styles, design tokens and Tailwind utility classes. Where possible, little to zero styling at all. 

## Core Components
- `CassetteDesigner.vue`: Tool for designing parametric cassette templates.
- `ArtifactsTable.vue`: Displays and manages production artifacts.
- `BatchManagement.vue`: Interface for creating and tracking production batches.
- `BatchEditor.vue`: Complex editor for batch entries, nesting options, and artifact selection.
- `pages/project/[slug]/data.vue`: Management of project-wide sheets inventory and material usage logs.

## Features
### Artifact Selection
Users can now choose which artifacts to generate during nesting (DXF, SVG, PDF Passport, Nesting Report). DXF is mandatory.

### Project Data Management
- **Sheets Inventory:** Track available material sheets (size, material type, quantity).
- **Cut Logs:** Historical record of "CUT" batches with utilization and waste statistics.
- **Material Tracking:** Basic management of aluminum composite, steel, and aluminum materials.

### Architecture (Target)
- **Model Layer:** A high-level tree structure representing the cassette (faces, flanges, parameters).
- **Geometry Layer:** Conversion of the model into a Nodi3D graph for evaluation and SVG path generation.
- **View Layer:** Vue component handling user interaction, SVG canvas, and property editing.

### Data Flow
1. User interacts with SVG canvas (click edge).
2. `CassetteModel` updates the tree structure.
3. `CassetteModel` regenerates the Nodi3D graph.
4. `nodi-modular` evaluates the graph and returns geometry.
5. View layer renders SVG paths and interactive elements.

## Related
- [docs/specs/cassette-schema.md](../docs/specs/cassette-schema.md)
- [docs/guides/NODI3D_GRAPH_GUIDE.md](../docs/guides/NODI3D_GRAPH_GUIDE.md)
