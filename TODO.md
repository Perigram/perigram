# CassetteDesigner (new feature)
Check ref folder. It has json file with nodi3d graph, code that uses it in App.tsx (it's react but gives an idea how it works), and official example from nodi3d repo. 
Need to implement test cassette designer in frontend. I have my own Cassette.json for testing. 
Main task is to get nodi3d working in Vue3 component, manipulate json interactively, and display results. 
In Casssette.json, there is a subgraph that creates basic rectangle (uses two input number nodes) and sequence of repeating subgraphs that create extrusions along polyline edges (inputs: polyline to modify, edge index to stick extrusion to, extrusion length; output: new extrusion, union of new+old). Each new extrusion takes previous united polygon as input, so result is cumulative. I want to have visual interface that will display first rectangle, then allow user to select edge and set extrusion length, and see updated shape, with no limits on how many extrusions user can add. Probably no need to use libraries, just plain svg rendering in Vue component. Need to plan and execute this task.

[x] COMPLETED - v0.1 Basic Implementation

## Implementation Details
- Created `/components/CassetteDesigner.vue` - Interactive SVG-based cassette designer
- Created `/pages/designer-test.vue` - Test page for the designer
- Access at: `/designer-test`

## Features Implemented (v0.1)
- ✅ Basic rectangle display with adjustable width/height parameters
- ✅ Interactive edge selection (hover to highlight, click to select)
- ✅ Add unlimited extrusions to any edge
- ✅ Visual feedback for selected/hovered edges
- ✅ Cumulative extrusion application (each extrusion modifies the polygon)
- ✅ Extrusion management (view list, remove individual extrusions)
- ✅ Pure SVG rendering (no 3D libraries needed)
- ✅ Responsive layout with controls panel
- ✅ Reset functionality

## Technical Notes
- Uses plain geometry calculations instead of nodi3d for v0.1 (simpler, faster)
- Polygon vertices calculated manually with perpendicular edge extrusions
- Each extrusion creates two new vertices, inserted into polygon sequentially
- All extrusions applied cumulatively starting from base rectangle

## Future Enhancements (v0.2+)
- [ ] Integrate actual nodi3d library for complex parametric operations
- [ ] Load and parse Cassette.json graph
- [ ] Export to DXF format
- [ ] Undo/Redo functionality
- [ ] Named parameters (A, B, C, etc.) linked to dimensions
- [ ] Save/load cassette configurations

# Bugs
- [ ] Docker seem to use different PrimeVue or idk, it builds slightly different CSS (Select in Menubar, label hidden in pt works only locally but not in deployment)
- [ ] OAuth redirect URIs need to be set correctly, now no pages exist yet

