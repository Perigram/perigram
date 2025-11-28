# CassetteDesigner (new feature)
[x] COMPLETED - Dynamic graph manipulation with nodi3d

## Implementation Details
- Implemented proper dynamic graph manipulation in `/components/CassetteDesigner.vue`
- Starts with only Rectangle subgraph + two Number nodes for dimensions
- Dynamically adds "Grow Side Face" subgraphs with connections on demand
- Uses nodi-modular library to evaluate and render geometry
- Test page available at `/designer-test`

## Features Implemented
- ✅ nodi3d integration working in Vue3 component
- ✅ Dynamic graph node creation and manipulation
- ✅ Interactive SVG display with edge selection on current polygon
- ✅ Rectangle dimensions adjustable (width/height)
- ✅ **Unlimited extrusions** supported via dynamic graph manipulation
- ✅ Visual display of individual extrusions (green) and current polygon (blue)
- ✅ Edge picking with hover/selection states
- ✅ Pan/Zoom controls for SVG canvas
- ✅ Extrusion management (add/remove/reset)
- ✅ Current polygon tracks latest output for edge selection

## Technical Implementation
- Creates initial graph with Rectangle subgraph programmatically
- On each extrusion: creates 3 new nodes (edge Number, length Number, Grow Side Face subgraph)
- Properly chains connections: previous output → Grow Face input → new output
- Tracks `currentPolygonOutputId` to always select edges from latest shape
- First output of each Grow Face becomes new current polygon
- Second output renders as individual extrusion rectangle
- Removes nodes and updates connections when extrusions are deleted
- Follows NODI3D_GRAPH_GUIDE.md for proper parameter ID connections

## How It Works
1. Start: Rectangle subgraph (2 inputs: width, height) → outputs current polygon
2. Add extrusion: Create Grow Face node connected to current polygon output
3. Current polygon updates to Grow Face's first output (union)
4. Individual extrusion shown from Grow Face's second output
5. Next extrusion connects to updated current polygon
6. Chain continues indefinitely



# Bugs
- [ ] Docker seem to use different PrimeVue or idk, it builds slightly different CSS (Select in Menubar, label hidden in pt works only locally but not in deployment)
- [ ] OAuth redirect URIs need to be set correctly, now no pages exist yet

