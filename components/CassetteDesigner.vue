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
    <div class="flex-1 border rounded p-4 bg-surface-50">
      <svg 
        :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
        class="w-full h-full"
        @mousemove="handleMouseMove"
        @click="handleClick"
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

// Initialize nodi3d
onMounted(async () => {
  try {
    await init();
    modular.value = Modular.new();
    // Pass the graph property, not the whole JSON
    modular.value.loadGraph(JSON.stringify(cassetteGraph.graph));
    await evaluateGraph();
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
    
    const extrusions = [];
    let unionCurve = null;
    
    geometryIdentifiers.forEach((id, index) => {
      const interop = modular.value.findGeometryInteropById(id);
      
      if (interop?.variant === 'Curve') {
        const { vertices } = interop.data;
        const path = verticesToSVGPath(vertices);
        
        // The first geometry from "Grow Side Face" outputs:
        // - 0th output (1st) goes to next subgraph input (union)
        // - 1th output (2nd) is the individual extrusion
        // We need to identify which is which based on the graph structure
        
        // For now, assume last one is final union (from BoundarySurfaces input)
        // Others are intermediate curves
        extrusions.push({ path, vertices });
      }
    });
    
    // Last one should be the accumulating union
    if (extrusions.length > 0) {
      unionCurve = extrusions[extrusions.length - 1];
      extrusionPaths.value = extrusions.slice(0, -1).map(e => e.path);
      unionPath.value = unionCurve.path;
      updateEdgesFromCurve(unionCurve.vertices);
      updateViewBox(unionCurve.vertices);
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
  
  viewBox.value = {
    x: minX,
    y: -maxY,
    width: maxX - minX,
    height: maxY - minY
  };
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

// Mouse interaction
const handleMouseMove = (event) => {
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
  if (hoveredEdge.value !== null) {
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

// Rebuild graph with current extrusions by modifying existing subgraph parameters
const rebuildGraph = async () => {
  if (!modular.value) return;
  
  try {
    const nodes = modular.value.getNodes();
    
    // Find "Grow Side Face" subgraph nodes
    const growNodes = nodes.filter(n => n.variant === 'SubGraph' && n.label === 'Grow Side Face');
    
    // Update parameters for each extrusion
    extrusions.value.forEach((ext, idx) => {
      if (idx < growNodes.length) {
        const node = growNodes[idx];
        
        // Find NumberSlider and Number nodes feeding into this subgraph
        // Need to update edge index (slider) and length (number)
        // This requires finding the connected input nodes
        
        // For now, just update the slider value if we can find it
        const sliderNodes = nodes.filter(n => n.variant === 'NumberSlider');
        if (sliderNodes[idx]) {
          modular.value.changeNodeProperty(sliderNodes[idx].id, {
            name: 'value',
            value: { type: 'Number', content: ext.edge }
          });
        }
        
        const numberNodes = nodes.filter(n => n.variant === 'Number' && n.label === '');
        // Skip first 2 (rectangle dimensions)
        if (numberNodes[idx + 2]) {
          modular.value.changeNodeProperty(numberNodes[idx + 2].id, {
            name: 'value',
            value: { type: 'Number', content: ext.length }
          });
        }
      }
    });
    
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
