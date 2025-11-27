<template>
  <div class="cassette-designer">
    <div class="designer-header">
      <h2>Cassette Designer v0.1</h2>
      <div class="controls">
        <Button label="Reset" @click="reset" size="small" />
      </div>
    </div>

    <div class="designer-content">
      <div class="svg-viewport">
        <svg
          ref="svgRef"
          :viewBox="viewBox"
          @click="handleSvgClick"
          @mousemove="handleSvgMouseMove"
        >
          <!-- Polygon shape -->
          <polygon
            v-if="currentPolygon.length > 0"
            :points="polygonPoints"
            fill="#e8dcc4"
            stroke="#2c3e50"
            stroke-width="2"
          />
          
          <!-- Edge highlights on hover -->
          <line
            v-for="(edge, idx) in edges"
            :key="'edge-' + idx"
            :x1="edge.x1"
            :y1="edge.y1"
            :x2="edge.x2"
            :y2="edge.y2"
            :stroke="hoveredEdgeIndex === idx ? '#e74c3c' : 'transparent'"
            stroke-width="6"
            stroke-opacity="0.5"
            style="cursor: pointer"
            @mouseenter="hoveredEdgeIndex = idx"
            @mouseleave="hoveredEdgeIndex = null"
            @click.stop="selectEdge(idx)"
          />
          
          <!-- Edge labels -->
          <text
            v-for="(edge, idx) in edges"
            :key="'label-' + idx"
            :x="(edge.x1 + edge.x2) / 2"
            :y="(edge.y1 + edge.y2) / 2"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="#34495e"
            font-size="14"
            font-weight="bold"
            pointer-events="none"
          >
            {{ idx }}
          </text>
        </svg>
      </div>

      <div class="controls-panel">
        <Card>
          <template #title>Parameters</template>
          <template #content>
            <div class="parameter-group">
              <label>Width</label>
              <InputNumber v-model="width" :min="100" :max="2000" :step="50" @input="updateShape" />
            </div>
            
            <div class="parameter-group">
              <label>Height</label>
              <InputNumber v-model="height" :min="100" :max="2000" :step="50" @input="updateShape" />
            </div>

            <Divider />

            <div v-if="selectedEdgeIndex !== null" class="extrusion-controls">
              <h4>Add Extrusion to Edge {{ selectedEdgeIndex }}</h4>
              <div class="parameter-group">
                <label>Extrusion Length</label>
                <InputNumber 
                  v-model="extrusionLength" 
                  :min="50" 
                  :max="500" 
                  :step="10" 
                />
              </div>
              <Button label="Add Extrusion" @click="addExtrusion" />
            </div>

            <div v-else class="help-text">
              <p>Click on an edge (hover to highlight) to add an extrusion</p>
            </div>

            <Divider />

            <div class="extrusions-list">
              <h4>Extrusions ({{ extrusions.length }})</h4>
              <div v-for="(ext, idx) in extrusions" :key="idx" class="extrusion-item">
                <span>Edge {{ ext.edgeIndex }}: {{ ext.length }}mm</span>
                <Button 
                  icon="pi pi-times" 
                  size="small" 
                  text 
                  severity="danger"
                  @click="removeExtrusion(idx)" 
                />
              </div>
              <p v-if="extrusions.length === 0" class="empty-state">No extrusions yet</p>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import InputNumber from 'primevue/inputnumber';
import Divider from 'primevue/divider';

// Base dimensions
const width = ref(500);
const height = ref(600);

// Current polygon vertices (as computed from nodi3d or manual calculation)
const currentPolygon = ref([]);

// Extrusions list
const extrusions = ref([]);

// UI state
const selectedEdgeIndex = ref(null);
const hoveredEdgeIndex = ref(null);
const extrusionLength = ref(100);
const svgRef = ref(null);

// Initialize with basic rectangle
const initializeRectangle = () => {
  const w = width.value;
  const h = height.value;
  currentPolygon.value = [
    { x: -w/2, y: -h/2 },
    { x: w/2, y: -h/2 },
    { x: w/2, y: h/2 },
    { x: -w/2, y: h/2 }
  ];
};

// Compute edges from polygon
const edges = computed(() => {
  if (currentPolygon.value.length < 2) return [];
  
  const edgeList = [];
  for (let i = 0; i < currentPolygon.value.length; i++) {
    const p1 = currentPolygon.value[i];
    const p2 = currentPolygon.value[(i + 1) % currentPolygon.value.length];
    edgeList.push({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      index: i
    });
  }
  return edgeList;
});

// Convert polygon to SVG points string
const polygonPoints = computed(() => {
  return currentPolygon.value.map(p => `${p.x},${p.y}`).join(' ');
});

// Compute viewBox to fit the polygon with padding
const viewBox = computed(() => {
  if (currentPolygon.value.length === 0) return '-500 -500 1000 1000';
  
  const xs = currentPolygon.value.map(p => p.x);
  const ys = currentPolygon.value.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const padding = 100;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;
  
  return `${minX - padding} ${minY - padding} ${w} ${h}`;
});

// Select an edge for extrusion
const selectEdge = (edgeIndex) => {
  selectedEdgeIndex.value = edgeIndex;
};

// Add extrusion to selected edge
const addExtrusion = () => {
  if (selectedEdgeIndex.value === null) return;
  
  extrusions.value.push({
    edgeIndex: selectedEdgeIndex.value,
    length: extrusionLength.value
  });
  
  applyExtrusions();
  selectedEdgeIndex.value = null;
};

// Remove an extrusion
const removeExtrusion = (index) => {
  extrusions.value.splice(index, 1);
  applyExtrusions();
};

// Apply all extrusions cumulatively
const applyExtrusions = () => {
  // Start with base rectangle
  initializeRectangle();
  
  // Apply each extrusion in sequence
  for (const ext of extrusions.value) {
    applyExtrusionToPolygon(ext.edgeIndex, ext.length);
  }
};

// Apply a single extrusion to the current polygon
const applyExtrusionToPolygon = (edgeIndex, length) => {
  if (edgeIndex >= currentPolygon.value.length) return;
  
  const p1 = currentPolygon.value[edgeIndex];
  const p2 = currentPolygon.value[(edgeIndex + 1) % currentPolygon.value.length];
  
  // Calculate perpendicular direction (outward normal)
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  // Perpendicular vector (rotated 90 degrees clockwise for outward)
  const nx = dy / len;
  const ny = -dx / len;
  
  // New vertices for the extrusion
  const newP1 = { x: p1.x + nx * length, y: p1.y + ny * length };
  const newP2 = { x: p2.x + nx * length, y: p2.y + ny * length };
  
  // Insert new vertices into polygon
  const newPolygon = [...currentPolygon.value];
  newPolygon.splice(edgeIndex + 1, 0, newP2, newP1);
  
  currentPolygon.value = newPolygon;
};

// Update shape when dimensions change
const updateShape = () => {
  applyExtrusions();
};

// Reset to initial state
const reset = () => {
  width.value = 500;
  height.value = 600;
  extrusions.value = [];
  selectedEdgeIndex.value = null;
  initializeRectangle();
};

// Handle SVG interactions
const handleSvgClick = (event) => {
  // Deselect if clicking on empty space
  if (event.target.tagName === 'svg' || event.target.tagName === 'polygon') {
    selectedEdgeIndex.value = null;
  }
};

const handleSvgMouseMove = (event) => {
  // Could add more interactive features here
};

// Initialize on mount
onMounted(() => {
  initializeRectangle();
});
</script>

<style scoped>
.cassette-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background-primary, #f5f5f5);
}

.designer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: var(--background-secondary, #fff);
  border-bottom: 1px solid var(--separator-primary, #e0e0e0);
}

.designer-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--label-primary, #000);
}

.designer-content {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 1rem;
  padding: 1rem;
  flex: 1;
  overflow: hidden;
}

.svg-viewport {
  background: white;
  border-radius: 8px;
  border: 1px solid var(--separator-primary, #e0e0e0);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.svg-viewport svg {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.controls-panel {
  overflow-y: auto;
}

.parameter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.parameter-group label {
  font-weight: 600;
  color: var(--label-primary, #000);
}

.extrusion-controls h4,
.extrusions-list h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: var(--label-primary, #000);
}

.help-text {
  padding: 1rem;
  background: var(--fill-tertiary, #f0f0f0);
  border-radius: 4px;
  color: var(--label-secondary, #666);
}

.help-text p {
  margin: 0;
  font-size: 0.9rem;
}

.extrusions-list {
  max-height: 300px;
  overflow-y: auto;
}

.extrusion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  background: var(--fill-tertiary, #f8f8f8);
  border-radius: 4px;
  font-size: 0.9rem;
}

.empty-state {
  color: var(--label-tertiary, #999);
  font-style: italic;
  text-align: center;
  padding: 1rem;
}

@media (max-width: 1024px) {
  .designer-content {
    grid-template-columns: 1fr;
  }
  
  .controls-panel {
    max-height: 400px;
  }
}
</style>
