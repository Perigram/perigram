# COMPONENT: Components

This directory contains Vue components used in the Cutkit-Demo application.

## Style Guide
- Where not absolutely necessary, avoid using custom css, rely on PrimeVue default styles, design tokens and Tailwind utility classes.

## Core Components
- `CassetteDesigner.vue`: Tool for designing parametric cassette templates.
- `ArtifactsTable.vue`: Displays and manages production artifacts.
- `BatchManagement.vue`: Interface for creating and tracking production batches.

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
