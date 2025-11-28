# CassetteDesigner (new feature)
[x] COMPLETED - nodi3d working in Vue3 component

## Implementation Details
- Fixed `/components/CassetteDesigner.vue` to use fresh Cassette.json without base_graph manipulations
- Uses nodi-modular library to evaluate and render geometry
- Test page available at `/designer-test`

## Features Implemented
- ✅ nodi3d integration working in Vue3 component
- ✅ Load and evaluate Cassette.json graph
- ✅ Interactive SVG display with edge selection
- ✅ Rectangle dimensions adjustable (width/height)
- ✅ Up to 3 extrusions supported (limited by pre-existing graph structure)
- ✅ Visual display of individual extrusions (green) and union outline (blue)
- ✅ Edge picking with hover/selection states
- ✅ Pan/Zoom controls for SVG canvas
- ✅ Extrusion management (add/remove)
- ✅ Reset functionality

## Technical Implementation
- Uses actual Cassette.json from ref folder (copied to /public)
- Modifies existing graph nodes rather than rebuilding graph structure
- Updates Number node properties for edge index and extrusion length
- Renders curves from nodi3d evaluation as SVG paths
- Projects 3D geometry to 2D for SVG display

## Known Limitations
- Currently supports max 3 extrusions (graph has 3 pre-existing "Grow Side Face" subgraphs)
- To support unlimited extrusions would require dynamic graph node creation (complex)



# Bugs
- [ ] Docker seem to use different PrimeVue or idk, it builds slightly different CSS (Select in Menubar, label hidden in pt works only locally but not in deployment)
- [ ] OAuth redirect URIs need to be set correctly, now no pages exist yet

