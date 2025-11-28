# Nodi3D Graph Modification Guide

## Structure Overview

```javascript
{
  version: "2.1.15",
  title: "Graph Name",
  graph: {
    nodes: {},        // { nodeId: nodeObject }
    sub_graphs: {}    // { subgraphId: subgraphDef }
  },
  display: {
    root: { nodes: {} }  // UI positions
  }
}
```

## Key Concepts[1]

**Nodes** have: id, name, label, input, output, entity, enabled, visible

**Parameters** have: id, name, access_type, hint, connections[]

**Connections** reference parameter IDs bidirectionally (output→inputs, input→outputs)

**Subgraphs** are reusable definitions with multiple instances. Interface via SubGraphInput/Output nodes with index property mapping to parent parameters.

## Essential Operations

### 1. Add Node

```javascript
import { v4 as uuid } from 'uuid';

function addNode(data, nodeType, label = '', position = [0, 0]) {
  const nodeId = uuid();
  
  data.graph.nodes[nodeId] = {
    id: nodeId,
    name: nodeType,
    label: label,
    input: { parameters: [] },
    output: { parameters: [] },
    entity: { variant: nodeType, data: {} },
    enabled: true,
    visible: true
  };
  
  data.display.root.nodes[nodeId] = {
    position: { x: position[0], y: position[1] },
    inputs: [],
    outputs: []
  };
  
  return nodeId;
}
```

### 2. Add Parameter

```javascript
function addParameter(node, type, name, accessType = 'Item', hint = '') {
  const paramId = uuid();
  const param = {
    id: paramId,
    name: name,
    access_type: accessType,  // 'Item', 'List', or 'Tree'
    hint: hint,
    connections: []
  };
  
  node[type].parameters.push(param);
  return paramId;
}

// Usage
const node = data.graph.nodes[nodeId];
addParameter(node, 'input', 'value', 'Item', 'Number');
addParameter(node, 'output', 'result', 'Item', 'Number');
```

### 3. Connect Nodes

```javascript
function connect(data, srcNodeId, srcOutIdx, tgtNodeId, tgtInIdx) {
  const src = data.graph.nodes[srcNodeId];
  const tgt = data.graph.nodes[tgtNodeId];
  
  const srcParamId = src.output.parameters[srcOutIdx].id;
  const tgtParamId = tgt.input.parameters[tgtInIdx].id;
  
  // Bidirectional connection
  src.output.parameters[srcOutIdx].connections.push(tgtParamId);
  tgt.input.parameters[tgtInIdx].connections.push(srcParamId);
}
```

### 4. Delete Node

```javascript
function deleteNode(data, nodeId) {
  const node = data.graph.nodes[nodeId];
  if (!node) return;
  
  // Collect parameter IDs
  const paramIds = new Set();
  [...node.input.parameters, ...node.output.parameters]
    .forEach(p => paramIds.add(p.id));
  
  // Remove connections from other nodes
  Object.values(data.graph.nodes).forEach(other => {
    [...other.input.parameters, ...other.output.parameters].forEach(p => {
      p.connections = p.connections.filter(id => !paramIds.has(id));
    });
  });
  
  delete data.graph.nodes[nodeId];
  delete data.display.root.nodes[nodeId];
}
```

### 5. Duplicate Node

```javascript
function duplicateNode(data, nodeId, offset = [50, 50]) {
  const original = data.graph.nodes[nodeId];
  const newId = uuid();
  
  const newNode = JSON.parse(JSON.stringify(original));
  newNode.id = newId;
  
  // Regenerate parameter IDs, clear connections
  ['input', 'output'].forEach(type => {
    newNode[type].parameters.forEach(p => {
      p.id = uuid();
      p.connections = [];
    });
  });
  
  data.graph.nodes[newId] = newNode;
  
  // Copy display with offset
  const oldDisplay = data.display.root.nodes[nodeId];
  data.display.root.nodes[newId] = {
    ...JSON.parse(JSON.stringify(oldDisplay)),
    position: {
      x: oldDisplay.position.x + offset[0],
      y: oldDisplay.position.y + offset[1]
    }
  };
  
  return newId;
}
```

### 6. Create Subgraph

```javascript
function createSubgraph(data, label = 'New Subgraph') {
  const sgId = uuid();
  
  data.graph.sub_graphs[sgId] = {
    id: sgId,
    graph: { nodes: {}, sub_graphs: {} },
    instances: []
  };
  
  return sgId;
}
```

### 7. Add Subgraph I/O

```javascript
function addSubgraphIO(subgraph, type, index) {
  const nodeId = uuid();
  const paramId = uuid();
  const isInput = type === 'input';
  
  const node = {
    id: nodeId,
    name: `Sub Graph ${isInput ? 'Input' : 'Output'}`,
    input: { parameters: isInput ? [] : [{
      id: paramId, name: 'input', access_type: 'Tree',
      hint: '', connections: []
    }]},
    output: { parameters: isInput ? [{
      id: paramId, name: 'output', access_type: 'Tree',
      hint: '', connections: []
    }] : []},
    entity: {
      variant: `SubGraph${isInput ? 'Input' : 'Output'}`,
      data: { index: index }
    },
    enabled: true,
    visible: false
  };
  
  subgraph.graph.nodes[nodeId] = node;
  return nodeId;
}
```

### 8. Create Subgraph Instance

```javascript
function createInstance(data, subgraphId, label = '', position = [0, 0]) {
  const instanceId = uuid();
  const nodeId = uuid();
  
  const subgraph = data.graph.sub_graphs[subgraphId];
  subgraph.instances.push(instanceId);
  
  // Count I/O nodes to determine parameters
  let inputCount = 0, outputCount = 0;
  Object.values(subgraph.graph.nodes).forEach(n => {
    if (n.entity.variant === 'SubGraphInput')
      inputCount = Math.max(inputCount, n.entity.data.index + 1);
    if (n.entity.variant === 'SubGraphOutput')
      outputCount = Math.max(outputCount, n.entity.data.index + 1);
  });
  
  // Create parameters
  const inputs = Array.from({ length: inputCount }, (_, i) => ({
    id: uuid(), name: `${i}th target`, access_type: 'Tree',
    hint: '', connections: []
  }));
  
  const outputs = Array.from({ length: outputCount }, (_, i) => ({
    id: uuid(), name: `${i}th output`, access_type: 'Tree',
    hint: '', connections: []
  }));
  
  data.graph.nodes[nodeId] = {
    id: nodeId,
    name: 'Sub Graph',
    label: label,
    input: { parameters: inputs },
    output: { parameters: outputs },
    entity: { variant: 'SubGraph', data: { instance_id: instanceId } },
    enabled: true,
    visible: true
  };
  
  data.display.root.nodes[nodeId] = {
    position: { x: position[0], y: position[1] },
    inputs: Array(inputCount).fill(null),
    outputs: []
  };
  
  return { nodeId, instanceId };
}
```

### 9. Delete Subgraph Instance

```javascript
function deleteInstance(data, nodeId) {
  const node = data.graph.nodes[nodeId];
  if (!node || node.entity.variant !== 'SubGraph') return;
  
  const instanceId = node.entity.data.instance_id;
  
  // Remove from instances array
  Object.values(data.graph.sub_graphs).forEach(sg => {
    sg.instances = sg.instances.filter(id => id !== instanceId);
  });
  
  deleteNode(data, nodeId);
}
```

### 10. Delete Subgraph Definition

```javascript
function deleteSubgraph(data, subgraphId) {
  const subgraph = data.graph.sub_graphs[subgraphId];
  if (!subgraph) return;
  
  const instanceIds = new Set(subgraph.instances);
  
  // Find and delete all instance nodes
  Object.entries(data.graph.nodes).forEach(([nodeId, node]) => {
    if (node.entity.variant === 'SubGraph' &&
        instanceIds.has(node.entity.data.instance_id)) {
      deleteNode(data, nodeId);
    }
  });
  
  delete data.graph.sub_graphs[subgraphId];
}
```

## Complete Example

```javascript
import fs from 'fs';
import { v4 as uuid } from 'uuid';

// Load graph
const data = JSON.parse(fs.readFileSync('Cassette.json', 'utf8'));

// Create subgraph with multiply operation
const sgId = createSubgraph(data, 'Multiplier');
const sg = data.graph.sub_graphs[sgId];

// Add I/O: 2 inputs, 1 output
addSubgraphIO(sg, 'input', 0);
addSubgraphIO(sg, 'input', 1);
const outNode = addSubgraphIO(sg, 'output', 0);

// Add multiply node inside
const multId = addNode({ graph: sg.graph, display: { root: { nodes: {} }}}, 
                       '×', '', [200, 100]);
const mult = sg.graph.nodes[multId];
addParameter(mult, 'input', 'a', 'Item', 'Number');
addParameter(mult, 'input', 'b', 'Item', 'Number');
addParameter(mult, 'output', 'output', 'Item', 'Number');
mult.entity.data = { a: 1, b: 1 };

// Create instance in main graph
const { nodeId } = createInstance(data, sgId, 'Multiplier', [300, 200]);

// Add number nodes to connect
const num1 = addNode(data, 'Number', 'Input 1', [100, 150]);
const num2 = addNode(data, 'Number', 'Input 2', [100, 250]);
data.graph.nodes[num1].entity.data = { value: 5, integer: true, precision: 1 };
data.graph.nodes[num2].entity.data = { value: 3, integer: true, precision: 1 };
addParameter(data.graph.nodes[num1], 'output', 'output value', 'Item', 'Number');
addParameter(data.graph.nodes[num2], 'output', 'output value', 'Item', 'Number');

// Connect: num1 → instance.input[0], num2 → instance.input[1]
connect(data, num1, 0, nodeId, 0);
connect(data, num2, 0, nodeId, 1);

// Save
fs.writeFileSync('Cassette_modified.json', JSON.stringify(data, null, 2));
```

## Critical Rules[1]

1. **UUIDs must be unique** - always generate new ones
2. **Connections are bidirectional** - update both parameter.connections arrays
3. **Reference parameter IDs** - not node IDs in connections
4. **Instance tracking** - instanceId must be in subgraph.instances array
5. **Index mapping** - SubGraphInput/Output index → parent parameter position
6. **Display sync** - keep display.root.nodes in sync with graph.nodes

