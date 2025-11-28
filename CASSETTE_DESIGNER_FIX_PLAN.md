# CassetteDesigner Fix Plan

## Current Issues

1. **Extrusion shapes include ALL curves** - Should only be geometries from Grow Face 1th outputs
2. **Delete buttons need to map to actual extrusions** - Track which geometry belongs to which extrusion
3. **Missing Boundary Surfaces node** - Should be connected to final 0th output
4. **Screen coordinates for delete buttons** - Need to convert SVG coords to screen coords

## Solution Architecture

### Graph Structure

```
[Width Number] ──┐
                 ├──> [Rectangle!] ──> [Boundary Surfaces] (initial)
[Height Number] ─┘

After adding 1 extrusion:
[Width] ──┐
          ├──> [Rectangle!] ──┐
[Height] ─┘                   ├──> [Grow Face #1] ──┬──> [Boundary Surfaces]
[Edge Number] ────────────────┘                     │
[Length Number] ─────────────────────────────────────┘
                                                     └──> (1th output = extrusion rect)

After adding 2 extrusions:
[Width] ──┐
          ├──> [Rectangle!] ──┐
[Height] ─┘                   ├──> [Grow Face #1] ──┬──> [Grow Face #2] ──┬──> [Boundary Surfaces]
[Edge #1] ────────────────────┘                     │                     │
[Length #1] ─────────────────────────────────────────┘                     │
[Edge #2] ─────────────────────────────────────────────────────────────────┘
[Length #2] ───────────────────────────────────────────────────────────────┘
                                 └──> (1th output #1)  └──> (1th output #2)
```

### Data Structures

```javascript
extrusions = [
  {
    edge: 0,
    length: 200,
    growNodeId: "uuid",
    growInstanceId: "uuid",
    edgeNodeId: "uuid",
    lengthNodeId: "uuid",
    extrusionOutputId: "uuid"  // NEW: 1th output parameter ID
  }
]

extrusionShapes = [
  {
    path: "M 0 0 L...",
    centroid: { x: 100, y: 200 },  // SVG coordinates
    screenCentroid: { x: 450, y: 300 },  // Screen coordinates
    extrusionIndex: 0  // Index in extrusions array
  }
]
```

### Implementation Steps

#### Step 1: Add Boundary Surfaces Node

**In `createInitialGraph()`:**
```javascript
// After creating Rectangle, create Boundary Surfaces node
const boundaryId = generateUUID()
const boundaryInputId = generateUUID()
const boundaryOutputId = generateUUID()

graph.nodes[boundaryId] = {
  id: boundaryId,
  name: 'Boundary Surfaces',
  label: '',
  input: {
    parameters: [{
      id: boundaryInputId,
      name: 'Geometry',
      access_type: 'Item',
      hint: 'Curve',
      connections: [rectOutputId],  // Connect to Rectangle output
    }],
  },
  output: {
    parameters: [{
      id: boundaryOutputId,
      name: 'Geometry',
      access_type: 'Item',
      hint: 'Curve',
      connections: [],
    }],
  },
  entity: {
    variant: 'BoundarySurfaces',
    data: {},
  },
  enabled: true,
  visible: true,
}

boundarySurfacesNodeId.value = boundaryId

// Update Rectangle to connect to Boundary Surfaces
graph.nodes[rectSubId].output.parameters[0].connections = [boundaryInputId]
```

#### Step 2: Update addExtrusion()

**Track extrusionOutputId (1th output):**
```javascript
// After creating Grow Face node
const extrusionOutputId = growOutput1Id  // 1th output

extrusions.value.push({
  edge: edgeIndex,
  length,
  growNodeId,
  growInstanceId,
  edgeNodeId,
  lengthNodeId,
  extrusionOutputId,  // NEW
})

// Update Boundary Surfaces to connect to new Grow Face 0th output
const boundaryNode = currentGraph.value.nodes[boundarySurfacesNodeId.value]
const oldConnection = boundaryNode.input.parameters[0].connections[0]

// Disconnect old source
for (const nodeId in currentGraph.value.nodes) {
  const node = currentGraph.value.nodes[nodeId]
  for (const param of node.output.parameters) {
    if (param.id === oldConnection) {
      param.connections = param.connections.filter(id => id !== boundaryNode.input.parameters[0].id)
    }
  }
}

// Connect Grow Face 0th output to Boundary Surfaces
boundaryNode.input.parameters[0].connections = [growOutput0Id]
currentGraph.value.nodes[growNodeId].output.parameters[0].connections.push(boundaryNode.input.parameters[0].id)
```

#### Step 3: Update evaluate()

**Map geometries to extrusion output IDs:**
```javascript
async function evaluate() {
  const result = await modular.value.evaluate()
  const { geometryIdentifiers } = result

  // Build map of output ID -> geometry
  const geometryMap = new Map()
  
  // Try to match geometries to node outputs
  // This is tricky because nodi3d doesn't give us the parameter ID directly
  // We need to match by order or properties
  
  // For now, use heuristic:
  // - Find largest curve = current polygon (from Boundary Surfaces)
  // - Match remaining curves to extrusions by vertex count/position
  
  const allCurves = []
  geometryIdentifiers.forEach((id) => {
    const interop = modular.value.findGeometryInteropById(id)
    if (interop?.variant === 'Curve') {
      const { vertices } = interop.data
      if (vertices && vertices.length > 0) {
        allCurves.push({ vertices, id })
      }
    }
  })

  // Largest curve = current polygon
  const sortedByVertices = [...allCurves].sort((a, b) => b.vertices.length - a.vertices.length)
  const currentPolygon = sortedByVertices[0]
  
  currentPolygonPath.value = verticesToSVGPath(currentPolygon.vertices)
  currentPolygonEdges.value = extractEdges(currentPolygon.vertices)

  // All 4-vertex curves are extrusion rectangles
  const extrusionCurves = allCurves.filter(c => c.vertices.length === 4 && c !== currentPolygon)
  
  // Map to extrusions array (assume same order)
  extrusionShapes.value = extrusionCurves.map((c, idx) => {
    const centroid = calculateCentroid(c.vertices)
    return {
      path: verticesToSVGPath(c.vertices),
      centroid,
      screenCentroid: svgToScreenCoords(centroid),  // NEW
      extrusionIndex: idx,  // Maps to extrusions[idx]
    }
  })
}
```

#### Step 4: Add svgToScreenCoords()

```javascript
function svgToScreenCoords(svgPoint) {
  if (!svgElement.value || !svgPoint) return null
  
  const svg = svgElement.value
  const pt = svg.createSVGPoint()
  pt.x = svgPoint.x
  pt.y = svgPoint.y
  
  try {
    const screenPt = pt.matrixTransform(svg.getScreenCTM())
    return { x: screenPt.x, y: screenPt.y }
  } catch (e) {
    return null
  }
}
```

#### Step 5: Update removeExtrusion()

**Reconnect Boundary Surfaces when removing:**
```javascript
async function removeExtrusion(idx) {
  // ... existing removal code ...
  
  // If we're removing the last extrusion in the chain:
  if (idx === extrusions.value.length - 1) {
    // Reconnect Boundary Surfaces to previous node
    const boundaryNode = currentGraph.value.nodes[boundarySurfacesNodeId.value]
    const newSource = idx === 0 
      ? currentGraph.value.nodes[rectSubgraphNodeId.value].output.parameters[0].id
      : currentGraph.value.nodes[extrusions.value[idx - 1].growNodeId].output.parameters[0].id
    
    // Update connections
    boundaryNode.input.parameters[0].connections = [newSource]
    
    // Add connection from source
    for (const nodeId in currentGraph.value.nodes) {
      const node = currentGraph.value.nodes[nodeId]
      for (const param of node.output.parameters) {
        if (param.id === newSource) {
          param.connections.push(boundaryNode.input.parameters[0].id)
        }
      }
    }
  }
}
```

## Testing Plan

1. Load page - should see rectangle with Boundary Surfaces
2. Add 1 extrusion - should see 1 green rectangle with delete button
3. Add 2nd extrusion - should see 2 green rectangles, each with delete button
4. Delete middle extrusion - should reconnect chain properly
5. Delete all extrusions - should go back to just rectangle
6. Zoom/pan - delete buttons should stay on centroids

## Files to Modify

- `/home/suo/cutkit-demo/components/CassetteDesigner.vue` - All changes in one file
