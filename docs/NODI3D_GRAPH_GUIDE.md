## Nodi3D Graph JSON Structure Guide

The Cassette.json file is a nodi3d graph containing 13 nodes in the main graph and 2 sub-graphs. Nodi is a node-based geometry design tool similar to Grasshopper or Dynamo that runs in the browser.[1][2][3]

### File Structure

The JSON file has three main sections:[1]
- **version**: Format version (currently "2.1.15")
- **graph**: Contains nodes, sub_graphs, and their connections
- **display**: UI positioning information for each node

### Node Anatomy

Each node consists of:[1]

```python
{
  "id": "unique-uuid",                    # Node identifier
  "name": "Node Type",                    # Type of node (e.g., "Number", "Sub Graph")
  "label": "Custom Label",                # Optional user-defined label
  "input": {
    "parameters": [...]                   # Input connection points
  },
  "output": {
    "parameters": [...]                   # Output connection points
  },
  "entity": {
    "variant": "NodeVariant",             # Specific node type
    "data": {...}                         # Node-specific data/settings
  },
  "enabled": true,                        # Whether node is active
  "visible": true                         # Whether node is visible in UI
}
```

### Connection System

Connections reference **parameter IDs**, not node IDs. Each parameter (input/output) has:[1]
- **id**: UUID for the parameter itself
- **connections**: Array of UUIDs referencing OTHER parameters

Output parameters store connections to input parameters they feed into. Input parameters store connections from output parameters that feed them.[1]

## Programmatic Modification Guide

### Adding a New Node

```python
import json
import uuid

def add_node(graph_data, node_type, label="", position=(0, 0)):
    """Add a new node to the graph"""
    
    # Generate UUIDs
    node_id = str(uuid.uuid4())
    
    # Create node structure
    new_node = {
        "id": node_id,
        "name": node_type,
        "label": label,
        "input": {"parameters": []},
        "output": {"parameters": []},
        "entity": {
            "variant": node_type,
            "data": {}  # Populate based on node type
        },
        "enabled": True,
        "visible": True
    }
    
    # Add to graph
    graph_data['graph']['nodes'][node_id] = new_node
    
    # Add display position
    if 'root' in graph_data['display']:
        graph_data['display']['root']['nodes'][node_id] = {
            "position": {"x": position[0], "y": position[1]},
            "inputs": [],
            "outputs": []
        }
    
    return node_id

# Example: Add a Number node
with open('Cassette.json', 'r') as f:
    data = json.load(f)

new_id = add_node(data, "Number", label="My Number", position=(100, 200))
```

### Adding Input/Output Parameters

```python
def add_parameter(node, param_type, name, access_type="Item", hint=""):
    """Add input or output parameter to a node"""
    
    param_id = str(uuid.uuid4())
    parameter = {
        "id": param_id,
        "name": name,
        "access_type": access_type,  # "Item", "List", or "Tree"
        "hint": hint,
        "connections": []
    }
    
    if param_type == "input":
        node['input']['parameters'].append(parameter)
    else:  # output
        node['output']['parameters'].append(parameter)
    
    return param_id

# Example usage
node = data['graph']['nodes'][new_id]
input_id = add_parameter(node, "input", "value", "Item", "Number")
output_id = add_parameter(node, "output", "result", "Item", "Number")
```

### Creating Connections

```python
def connect_nodes(graph_data, source_node_id, source_output_idx, 
                  target_node_id, target_input_idx):
    """Connect output of source node to input of target node"""
    
    source_node = graph_data['graph']['nodes'][source_node_id]
    target_node = graph_data['graph']['nodes'][target_node_id]
    
    # Get parameter IDs
    source_param_id = source_node['output']['parameters'][source_output_idx]['id']
    target_param_id = target_node['input']['parameters'][target_input_idx]['id']
    
    # Add connection to output parameter
    source_node['output']['parameters'][source_output_idx]['connections'].append(target_param_id)
    
    # Add connection to input parameter
    target_node['input']['parameters'][target_input_idx]['connections'].append(source_param_id)
    
    return (source_param_id, target_param_id)
```

### Deleting a Node

```python
def delete_node(graph_data, node_id):
    """Delete a node and clean up all its connections"""
    
    if node_id not in graph_data['graph']['nodes']:
        return False
    
    node = graph_data['graph']['nodes'][node_id]
    
    # Collect all parameter IDs from this node
    param_ids = set()
    for param in node['input']['parameters']:
        param_ids.add(param['id'])
    for param in node['output']['parameters']:
        param_ids.add(param['id'])
    
    # Remove connections from other nodes
    for other_id, other_node in graph_data['graph']['nodes'].items():
        if other_id == node_id:
            continue
            
        # Check outputs
        for out_param in other_node['output']['parameters']:
            out_param['connections'] = [
                c for c in out_param['connections'] 
                if c not in param_ids
            ]
        
        # Check inputs  
        for in_param in other_node['input']['parameters']:
            in_param['connections'] = [
                c for c in in_param['connections']
                if c not in param_ids
            ]
    
    # Remove node from graph
    del graph_data['graph']['nodes'][node_id]
    
    # Remove from display
    if 'root' in graph_data['display']:
        if node_id in graph_data['display']['root']['nodes']:
            del graph_data['display']['root']['nodes'][node_id]
    
    return True
```

### Duplicating a Node

```python
def duplicate_node(graph_data, node_id, offset=(50, 50)):
    """Duplicate a node with new UUIDs"""
    
    if node_id not in graph_data['graph']['nodes']:
        return None
    
    original = graph_data['graph']['nodes'][node_id]
    
    # Generate new IDs
    new_node_id = str(uuid.uuid4())
    
    # Deep copy node structure
    import copy
    new_node = copy.deepcopy(original)
    new_node['id'] = new_node_id
    
    # Generate new parameter IDs (but don't copy connections)
    for param in new_node['input']['parameters']:
        param['id'] = str(uuid.uuid4())
        param['connections'] = []  # Don't duplicate connections
    
    for param in new_node['output']['parameters']:
        param['id'] = str(uuid.uuid4())
        param['connections'] = []  # Don't duplicate connections
    
    # Add to graph
    graph_data['graph']['nodes'][new_node_id] = new_node
    
    # Copy display position with offset
    if 'root' in graph_data['display']:
        if node_id in graph_data['display']['root']['nodes']:
            old_display = graph_data['display']['root']['nodes'][node_id]
            new_display = copy.deepcopy(old_display)
            new_display['position']['x'] += offset[0]
            new_display['position']['y'] += offset[1]
            graph_data['display']['root']['nodes'][new_node_id] = new_display
    
    return new_node_id
```

### Critical Rules

When modifying the graph:[1]

1. **UUIDs must be unique**: Generate new UUIDs for all new nodes and parameters
2. **Bidirectional connections**: Update both source output AND target input parameter connections
3. **Parameter ID references**: Connections reference parameter IDs, not node IDs
4. **Display sync**: Keep display data synchronized with graph nodes
5. **Connection cleanup**: When deleting nodes, remove all references to their parameter IDs from other nodes
6. **Entity data**: Populate entity.data based on the specific node type requirements

### Complete Example

```python
import json
import uuid
import copy

# Load graph
with open('Cassette.json', 'r') as f:
    data = json.load(f)

# Add two number nodes
num1_id = add_node(data, "Number", "Input A", (100, 100))
num2_id = add_node(data, "Number", "Input B", (100, 200))

# Configure entity data for Number nodes
data['graph']['nodes'][num1_id]['entity']['data'] = {
    "value": 10,
    "integer": True,
    "precision": 1
}
data['graph']['nodes'][num2_id]['entity']['data'] = {
    "value": 20,
    "integer": True,
    "precision": 1
}

# Add output parameters
out1 = add_parameter(data['graph']['nodes'][num1_id], "output", 
                     "output value", "Item", "Number")
out2 = add_parameter(data['graph']['nodes'][num2_id], "output",
                     "output value", "Item", "Number")

# Save modified graph
with open('Cassette_modified.json', 'w') as f:
    json.dump(data, f, indent=2)
```

This guide enables full programmatic control over the nodi3d graph structure while maintaining data integrity.[2][1]

[1](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/8172199/c5b8c1e4-b890-4d7c-a2d2-4c658b927de5/Cassette.json)
[2](https://docs.nodi3d.com/nodi-editor/quickstart)
[3](https://nodi3d.com)
[4](https://docs.nodi3d.com/nodi-modular/quickstart)
[5](https://www.aecplustech.com/tools/nodi3d)
[6](https://stackoverflow.com/questions/23932122/building-a-graph-node-by-node-with-d3)
[7](https://thenodeinstitute.org/courses/introduction-to-visual-programming-with-touchdesigner/lessons/getting-to-know-the-software/topic/many-ways-to-connect-nodes-and-parameters/)
[8](https://www.npmjs.com/package/jsonschema)
[9](https://docs.nodi3d.com/nodi-editor/examples)
[10](https://www.magicad.com/tools/connection-nodes-between-models-piping/)
[11](https://json-schema.org/understanding-json-schema/reference)
