<template>
  <div class="flex gap-4 h-full">
    <!-- Controls Panel -->
    <div class="w-64 flex flex-col gap-4">
      <div v-if="!modular" class="text-sm">
        Loading nodi3d...
      </div>
      
      <template v-else>
        <div class="flex flex-col gap-2">
          <label class="font-semibold">Rectangle Width</label>
          <InputNumber v-model="rectWidth" :min="100" :max="1000" :step="50" @update:modelValue="updateRectangle" />
        </div>
        
        <div class="flex flex-col gap-2">
          <label class="font-semibold">Rectangle Height</label>
          <InputNumber v-model="rectHeight" :min="100" :max="1000" :step="50" @update:modelValue="updateRectangle" />
        </div>

        <Divider />

        <div class="flex flex-col gap-2">
          <label class="font-semibold">Extrusion Length</label>
          <InputNumber v-model="extrusionLength" :min="10" :max="500" :step="10" />
        </div>

        <Button 
          label="Add Extrusion"
          icon="pi pi-plus"
          @click="addExtrusion"
          :disabled="selectedEdge === null"
        />

        <Divider />

        <div class="flex flex-col gap-2">
          <label class="font-semibold">Extrusions ({{ extrusions.length }})</label>
          <div v-if="extrusions.length === 0" class="text-sm opacity-60">
            Click edge on shape to select, then add extrusion
          </div>
          <div v-for="(ext, idx) in extrusions" :key="idx" class="flex items-center gap-2 text-sm">
            <span>Edge {{ ext.edge }}: {{ ext.length }}mm</span>
            <Button 
              icon="pi pi-times" 
              text 
              severity="danger"
              size="small"
              @click="removeExtrusion(idx)"
            />
          </div>
        </div>

        <Button 
          label="Reset"
          icon="pi pi-refresh"
          severity="secondary"
          @click="reset"
        />
      </template>
    </div>

    <!-- SVG Canvas -->
    <div class="flex-1 border rounded p-4 bg-surface-50 relative">
      <div class="absolute top-6 right-6 flex gap-2 z-10">
        <Button icon="pi pi-plus" @click="zoomIn" size="small" />
        <Button icon="pi pi-minus" @click="zoomOut" size="small" />
        <Button icon="pi pi-refresh" @click="resetView" size="small" />
      </div>
      <svg 
        ref="svgElement"
        :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
        :class="isPanning ? 'cursor-move' : 'cursor-default'"
        class="w-full h-full"
        @mousemove="handleMouseMove"
        @mousedown="handleMouseDown"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseUp"
        @click="handleClick"
        @wheel.prevent="handleWheel"
      >
        <!-- Grid -->
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>
          </pattern>
        </defs>
        <rect :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#grid)" />

        <!-- Individual extrusions (2nd outputs) -->
        <path
          v-for="(ext, idx) in extrusionPaths"
          :key="`ext-${idx}`"
          :d="ext"
          fill="rgba(34, 197, 94, 0.2)"
          stroke="#22c55e"
          stroke-width="1.5"
        />

        <!-- Final union (for edge picking) -->
        <path
          v-if="unionPath"
          :d="unionPath"
          fill="none"
          stroke="#3b82f6"
          stroke-width="2"
        />

        <!-- Edges for interaction -->
        <line
          v-for="(edge, idx) in edges"
          :key="`edge-${idx}`"
          :x1="edge.x1"
          :y1="edge.y1"
          :x2="edge.x2"
          :y2="edge.y2"
          :stroke="getEdgeColor(idx)"
          :stroke-width="getEdgeWidth(idx)"
          stroke-linecap="round"
          class="cursor-pointer"
        />

        <!-- Edge labels -->
        <text
          v-for="(edge, idx) in edges"
          :key="`label-${idx}`"
          :x="(edge.x1 + edge.x2) / 2"
          :y="(edge.y1 + edge.y2) / 2"
          text-anchor="middle"
          dominant-baseline="middle"
          class="text-xs fill-gray-700 pointer-events-none"
        >
          {{ idx }}
        </text>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Divider from 'primevue/divider';
import init, { Modular } from 'nodi-modular';
import cassetteGraph from '~/ref/Cassette.json';

// State
const modular = ref(null);
const rectWidth = ref(500);
const rectHeight = ref(600);
const extrusionLength = ref(400);
const extrusions = ref([]);
const hoveredEdge = ref(null);
const selectedEdge = ref(null);

// Geometry data from nodi3d
const extrusionPaths = ref([]);
const unionPath = ref('');
const edges = ref([]);
const viewBox = ref({ x: -400, y: -400, width: 800, height: 800 });
const baseViewBox = ref({ x: -400, y: -400, width: 800, height: 800 });

// Pan/zoom state
const svgElement = ref(null);
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });

// Initialize nodi3d
onMounted(async () => {
  try {
    await init();
    modular.value = Modular.new();
    // Start with just rectangle, no extrusions
    await rebuildGraph();
  } catch (error) {
    console.error('Failed to initialize nodi3d:', error);
  }
});

// Update rectangle parameters in graph
const updateRectangle = async () => {
  if (!modular.value) return;
  
  try {
    const nodes = modular.value.getNodes();
    
    // Find the two Number nodes that feed into Rectangle subgraph
    const numberNodes = nodes.filter(n => n.variant === 'Number' && n.label === '');
    
    if (numberNodes.length >= 2) {
      // First Number is width (500), second is height (600)
      modular.value.changeNodeProperty(numberNodes[0].id, {
        name: 'value',
        value: { type: 'Number', content: rectWidth.value }
      });
      
      modular.value.changeNodeProperty(numberNodes[1].id, {
        name: 'value',
        value: { type: 'Number', content: rectHeight.value }
      });
    }
    
    await evaluateGraph();
  } catch (error) {
    console.error('Failed to update rectangle:', error);
  }
};

// Evaluate graph and extract geometry
const evaluateGraph = async () => {
  if (!modular.value) return;
  
  try {
    const result = await modular.value.evaluate();
    const { geometryIdentifiers } = result;
    
    const individualExtrusions = [];
    let finalUnion = null;
    
    // Get nodes to understand the graph structure
    const nodes = modular.value.getNodes();
    const extrusionNodes = nodes.filter(n => n.variant === 'SubGraph' && n.label === 'Grow Side Face');
    
    geometryIdentifiers.forEach((id) => {
      const interop = modular.value.findGeometryInteropById(id);
      
      if (interop?.variant === 'Curve') {
        const { vertices } = interop.data;
        const path = verticesToSVGPath(vertices);
        
        // Store all curves - we'll separate them below
        individualExtrusions.push({ path, vertices });
      }
    });
    
    // If we have extrusions, last curve is the final union (0th output of last Grow Side Face)
    // Other curves are individual extrusions (1th outputs)
    if (individualExtrusions.length > 0) {
      if (extrusions.value.length > 0) {
        // With extrusions: last is union, others are individual extrusions
        finalUnion = individualExtrusions[individualExtrusions.length - 1];
        extrusionPaths.value = individualExtrusions.slice(0, -1).map(e => e.path);
      } else {
        // Just rectangle, no extrusions yet
        finalUnion = individualExtrusions[0];
        extrusionPaths.value = [];
      }
      
      unionPath.value = finalUnion.path;
      updateEdgesFromCurve(finalUnion.vertices);
      
      // Only update viewBox on initial load or reset
      if (!baseViewBox.value.width || baseViewBox.value.width === 800) {
        updateViewBox(finalUnion.vertices);
      }
    }
  } catch (error) {
    console.error('Failed to evaluate graph:', error);
  }
};

// Convert 3D vertices to SVG path (project to XY plane)
const verticesToSVGPath = (vertices) => {
  if (vertices.length === 0) return '';
  
  const commands = vertices.map((v, idx) => {
    const [x, y] = v;
    // Flip Y for SVG coordinate system
    return idx === 0 ? `M ${x} ${-y}` : `L ${x} ${-y}`;
  });
  
  return commands.join(' ') + ' Z';
};

// Extract edges from curve vertices
const updateEdgesFromCurve = (vertices) => {
  edges.value = vertices.map((v, idx) => {
    const next = vertices[(idx + 1) % vertices.length];
    return {
      x1: v[0],
      y1: -v[1],
      x2: next[0],
      y2: -next[1]
    };
  });
};

// Update viewBox to fit geometry
const updateViewBox = (vertices) => {
  const padding = 100;
  const xs = vertices.map(v => v[0]);
  const ys = vertices.map(v => v[1]);
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;
  
  const box = {
    x: minX,
    y: -maxY,
    width: maxX - minX,
    height: maxY - minY
  };
  
  viewBox.value = box;
  baseViewBox.value = { ...box };
};

// Edge color based on state
const getEdgeColor = (idx) => {
  if (selectedEdge.value === idx) return '#ef4444';
  if (hoveredEdge.value === idx) return '#f59e0b';
  return '#3b82f6';
};

const getEdgeWidth = (idx) => {
  if (selectedEdge.value === idx || hoveredEdge.value === idx) return 4;
  return 2;
};

// Pan/Zoom controls
const handleMouseDown = (event) => {
  if (event.button === 0 && event.shiftKey) {
    isPanning.value = true;
    panStart.value = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  }
};

const handleMouseUp = () => {
  isPanning.value = false;
};

const handleWheel = (event) => {
  const delta = event.deltaY > 0 ? 1.1 : 0.9;
  const box = viewBox.value;
  
  const newWidth = box.width * delta;
  const newHeight = box.height * delta;
  const dx = (newWidth - box.width) / 2;
  const dy = (newHeight - box.height) / 2;
  
  viewBox.value = {
    x: box.x - dx,
    y: box.y - dy,
    width: newWidth,
    height: newHeight
  };
};

const zoomIn = () => {
  const box = viewBox.value;
  const scale = 0.8;
  const newWidth = box.width * scale;
  const newHeight = box.height * scale;
  const dx = (box.width - newWidth) / 2;
  const dy = (box.height - newHeight) / 2;
  
  viewBox.value = {
    x: box.x + dx,
    y: box.y + dy,
    width: newWidth,
    height: newHeight
  };
};

const zoomOut = () => {
  const box = viewBox.value;
  const scale = 1.25;
  const newWidth = box.width * scale;
  const newHeight = box.height * scale;
  const dx = (box.width - newWidth) / 2;
  const dy = (box.height - newHeight) / 2;
  
  viewBox.value = {
    x: box.x + dx,
    y: box.y + dy,
    width: newWidth,
    height: newHeight
  };
};

const resetView = () => {
  viewBox.value = { ...baseViewBox.value };
};

// Mouse interaction
const handleMouseMove = (event) => {
  if (isPanning.value) {
    const dx = (event.clientX - panStart.value.x) * (viewBox.value.width / svgElement.value.clientWidth);
    const dy = (event.clientY - panStart.value.y) * (viewBox.value.height / svgElement.value.clientHeight);
    
    viewBox.value = {
      ...viewBox.value,
      x: viewBox.value.x - dx,
      y: viewBox.value.y - dy
    };
    
    panStart.value = { x: event.clientX, y: event.clientY };
    return;
  }
  
  const svg = event.currentTarget;
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
  
  let closestIdx = null;
  let minDist = 15;
  
  edges.value.forEach((edge, idx) => {
    const dist = distanceToSegment(svgP.x, svgP.y, edge.x1, edge.y1, edge.x2, edge.y2);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = idx;
    }
  });
  
  hoveredEdge.value = closestIdx;
};

const handleClick = () => {
  if (!isPanning.value && hoveredEdge.value !== null) {
    selectedEdge.value = hoveredEdge.value;
  }
};

const distanceToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
};

// Add new extrusion subgraph
const addExtrusion = async () => {
  if (selectedEdge.value === null || !modular.value) return;
  
  extrusions.value.push({
    edge: selectedEdge.value,
    length: extrusionLength.value
  });
  
  await rebuildGraph();
  selectedEdge.value = null;
};

// Build graph dynamically from scratch
const rebuildGraph = async () => {
  if (!modular.value) return;
  
  try {
    // Deep clone sub_graphs to avoid circular reference issues
    const subGraphs = JSON.parse(JSON.stringify(cassetteGraph.graph.sub_graphs));
    
    // Start with clean base: Rectangle subgraph + dimension numbers
    const graph = {
      nodes: {},
      sub_graphs: subGraphs
    };
    
    // Add width Number node
    const widthNodeId = 'width-' + Date.now();
    graph.nodes[widthNodeId] = {
      id: widthNodeId,
      name: 'Number',
      label: '',
      input: { 
        parameters: [
          { id: widthNodeId + '-val', name: 'value', access_type: 'Item', hint: 'Number | Bool | String', connections: [] },
          { id: widthNodeId + '-int', name: 'integer or not', access_type: 'Item', hint: 'Bool', connections: [] }
        ]
      },
      output: { 
        parameters: [
          { id: widthNodeId + '-out', name: 'output value', access_type: 'Item', hint: 'Number', connections: ['rect-in-0'] }
        ]
      },
      entity: { variant: 'Number', data: { value: rectWidth.value, integer: true, precision: 10 }},
      enabled: true,
      visible: true
    };
    
    // Add height Number node
    const heightNodeId = 'height-' + Date.now();
    graph.nodes[heightNodeId] = {
      id: heightNodeId,
      name: 'Number',
      label: '',
      input: { 
        parameters: [
          { id: heightNodeId + '-val', name: 'value', access_type: 'Item', hint: 'Number | Bool | String', connections: [] },
          { id: heightNodeId + '-int', name: 'integer or not', access_type: 'Item', hint: 'Bool', connections: [] }
        ]
      },
      output: { 
        parameters: [
          { id: heightNodeId + '-out', name: 'output value', access_type: 'Item', hint: 'Number', connections: ['rect-in-1'] }
        ]
      },
      entity: { variant: 'Number', data: { value: rectHeight.value, integer: true, precision: 10 }},
      enabled: true,
      visible: true
    };
    
    // Add Rectangle subgraph
    const rectNodeId = 'rect-' + Date.now();
    const rectOutId = rectNodeId + '-out-0';
    graph.nodes[rectNodeId] = {
      id: rectNodeId,
      name: 'Sub Graph',
      label: 'Rectangle!',
      input: { 
        parameters: [
          { id: 'rect-in-0', name: '0th target', access_type: 'Tree', hint: '', connections: [widthNodeId + '-out'] },
          { id: 'rect-in-1', name: '1th target', access_type: 'Tree', hint: '', connections: [heightNodeId + '-out'] }
        ]
      },
      output: { 
        parameters: [
          { id: rectOutId, name: '0th output', access_type: 'Tree', hint: '', connections: [] }
        ]
      },
      entity: { variant: 'SubGraph', data: { instance_id: '72f3bb6f-3cb2-40be-8497-714c51dfa6c1' }},
      enabled: true,
      visible: false
    };
    
    let prevOutputId = rectOutId;
    
    // Add extrusion subgraphs
    extrusions.value.forEach((ext, idx) => {
      const extId = 'ext-' + idx + '-' + Date.now();
      const sliderId = extId + '-slider';
      const lengthId = extId + '-length';
      const extInputId0 = extId + '-in-0';
      const extInputId1 = extId + '-in-1';
      const extInputId2 = extId + '-in-2';
      const extOutputId0 = extId + '-out-0';
      const extOutputId1 = extId + '-out-1';
      const sliderOutId = sliderId + '-out';
      const lengthOutId = lengthId + '-out';
      
      // Edge index slider
      graph.nodes[sliderId] = {
        id: sliderId,
        name: 'Number Slider',
        label: '',
        input: { parameters: [] },
        output: { 
          parameters: [
            { id: sliderOutId, name: 'output value', access_type: 'Item', hint: 'Number', connections: [extInputId1] }
          ]
        },
        entity: { variant: 'NumberSlider', data: { domain: { min: 0, max: 10 }, step: 1, value: ext.edge }},
        enabled: true,
        visible: false
      };
      
      // Extrusion length number
      graph.nodes[lengthId] = {
        id: lengthId,
        name: 'Number',
        label: '',
        input: { 
          parameters: [
            { id: lengthId + '-val', name: 'value', access_type: 'Item', hint: 'Number | Bool | String', connections: [] },
            { id: lengthId + '-int', name: 'integer or not', access_type: 'Item', hint: 'Bool', connections: [] }
          ]
        },
        output: { 
          parameters: [
            { id: lengthOutId, name: 'output value', access_type: 'Item', hint: 'Number', connections: [extInputId2] }
          ]
        },
        entity: { variant: 'Number', data: { value: ext.length, integer: true, precision: 1 }},
        enabled: true,
        visible: false
      };
      
      // Grow Side Face subgraph
      graph.nodes[extId] = {
        id: extId,
        name: 'Sub Graph',
        label: 'Grow Side Face',
        input: { 
          parameters: [
            { id: extInputId0, name: '0th target', access_type: 'Tree', hint: '', connections: [prevOutputId] },
            { id: extInputId1, name: '1th target', access_type: 'Tree', hint: '', connections: [sliderOutId] },
            { id: extInputId2, name: '2th target', access_type: 'Tree', hint: '', connections: [lengthOutId] }
          ]
        },
        output: { 
          parameters: [
            { id: extOutputId0, name: '0th output', access_type: 'Tree', hint: '', connections: [] },
            { id: extOutputId1, name: '1th output', access_type: 'Tree', hint: '', connections: [] }
          ]
        },
        entity: { variant: 'SubGraph', data: { instance_id: '65f3238f-d937-45ce-bbee-494fc860ba3b' }},
        enabled: true,
        visible: true
      };
      
      prevOutputId = extOutputId0;
    });
    
    modular.value.loadGraph(JSON.stringify(graph));
    console.log('Built graph:', JSON.stringify(graph, null, 2));
    await evaluateGraph();
  } catch (error) {
    console.error('Failed to rebuild graph:', error);
  }
};

const removeExtrusion = async (idx) => {
  extrusions.value.splice(idx, 1);
  await rebuildGraph();
};

const reset = async () => {
  extrusions.value = [];
  selectedEdge.value = null;
  hoveredEdge.value = null;
  rectWidth.value = 500;
  rectHeight.value = 600;
  extrusionLength.value = 400;
  
  if (modular.value) {
    modular.value.loadGraph(JSON.stringify(cassetteGraph.graph));
    await evaluateGraph();
  }
};
</script>
