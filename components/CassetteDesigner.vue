<template>
    <div class="h-full flex flex-col">
        <!-- Top Controls Bar -->
        <div class="flex items-center gap-4 p-4 border-b">
            <div v-if="!modular" class="text-sm">Loading nodi3d...</div>
            <template v-else>
                <!-- Rectangle Dimensions -->
                <div class="flex items-center gap-2">
                    <label class="text-sm font-semibold">Width:</label>
                    <InputNumber
                        v-model="rectWidth"
                        :min="100"
                        :max="1000"
                        :step="50"
                        @update:modelValue="handleRectangleDimensionChange"
                        class="w-24"
                    />
                </div>
                <div class="flex items-center gap-2">
                    <label class="text-sm font-semibold">Height:</label>
                    <InputNumber
                        v-model="rectHeight"
                        :min="100"
                        :max="1000"
                        :step="50"
                        @update:modelValue="handleRectangleDimensionChange"
                        class="w-24"
                    />
                </div>

                <!-- View Controls -->
                <div class="ml-auto flex gap-2">
                    <Button icon="pi pi-plus" @click="zoomIn" size="small" title="Zoom In" />
                    <Button icon="pi pi-minus" @click="zoomOut" size="small" title="Zoom Out" />
                    <Button icon="pi pi-refresh" @click="resetView" size="small" title="Reset View" />
                    <Button label="Reset" icon="pi pi-replay" @click="resetDesign" severity="secondary" size="small" />
                </div>
            </template>
        </div>

        <!-- SVG Canvas -->
        <div class="flex-1 relative bg-surface-50">
            <svg
                ref="svgElement"
                :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
                :class="isPanning ? 'cursor-move' : 'cursor-default'"
                class="w-full h-full"
                @mousemove="handleMouseMove"
                @mousedown="handleMouseDown"
                @mouseup="handleMouseUp"
                @mouseleave="handleMouseUp"
                @wheel.prevent="handleWheel"
            >
                <!-- Background Grid -->
                <defs>
                    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e0e0e0" stroke-width="0.5" />
                    </pattern>
                </defs>
                <rect
                    :x="viewBox.x"
                    :y="viewBox.y"
                    :width="viewBox.width"
                    :height="viewBox.height"
                    fill="url(#grid)"
                />

                <!-- Extrusion Shapes (Green Rectangles) with Delete Buttons -->
                <g v-for="(ext, idx) in extrusionShapes" :key="`ext-${idx}`">
                    <!-- Extrusion Path -->
                    <path
                        :d="ext.path"
                        fill="rgba(34, 197, 94, 0.2)"
                        stroke="#22c55e"
                        stroke-width="1.5"
                        style="pointer-events: none"
                    />
                    
                    <!-- Delete Button (Red X at centroid) -->
                    <g v-if="ext.centroid" @click.stop="handleDeleteExtrusion(idx)" class="cursor-pointer">
                        <circle
                            :cx="ext.centroid.x"
                            :cy="ext.centroid.y"
                            r="15"
                            fill="rgba(239, 68, 68, 0.9)"
                            stroke="white"
                            stroke-width="2"
                        />
                        <line
                            :x1="ext.centroid.x - 8"
                            :y1="ext.centroid.y - 8"
                            :x2="ext.centroid.x + 8"
                            :y2="ext.centroid.y + 8"
                            stroke="white"
                            stroke-width="2.5"
                            stroke-linecap="round"
                        />
                        <line
                            :x1="ext.centroid.x + 8"
                            :y1="ext.centroid.y - 8"
                            :x2="ext.centroid.x - 8"
                            :y2="ext.centroid.y + 8"
                            stroke="white"
                            stroke-width="2.5"
                            stroke-linecap="round"
                        />
                    </g>
                </g>

                <!-- Current Polygon Outline (Blue) -->
                <path
                    v-if="currentPolygonPath"
                    :d="currentPolygonPath"
                    fill="none"
                    stroke="#3b82f6"
                    stroke-width="2"
                    style="pointer-events: none"
                />

                <!-- Interactive Edges with Add Face Buttons -->
                <g v-for="(edge, idx) in currentPolygonEdges" :key="`edge-${idx}`">
                    <!-- Invisible hover area for edge -->
                    <line
                        :x1="edge.x1"
                        :y1="edge.y1"
                        :x2="edge.x2"
                        :y2="edge.y2"
                        stroke="transparent"
                        stroke-width="15"
                        stroke-linecap="round"
                        class="cursor-pointer"
                        @mouseenter="hoveredEdge = idx"
                        @mouseleave="hoveredEdge = null"
                        @click.stop="handleAddFaceClick(idx, edge)"
                    />
                    
                    <!-- Add button (Blue + icon on hover) -->
                    <g
                        v-if="hoveredEdge === idx"
                        @click.stop="handleAddFaceClick(idx, edge)"
                        class="cursor-pointer"
                    >
                        <circle
                            :cx="edge.midX"
                            :cy="edge.midY"
                            r="12"
                            fill="rgba(59, 130, 246, 0.95)"
                            stroke="white"
                            stroke-width="2"
                        />
                        <line
                            :x1="edge.midX"
                            :y1="edge.midY - 6"
                            :x2="edge.midX"
                            :y2="edge.midY + 6"
                            stroke="white"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                        <line
                            :x1="edge.midX - 6"
                            :y1="edge.midY"
                            :x2="edge.midX + 6"
                            :y2="edge.midY"
                            stroke="white"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                    </g>
                </g>
            </svg>

            <!-- Add Face Dialog (Outside SVG for fixed positioning) -->
            <div
                v-if="addFaceDialog.visible"
                :style="{
                    position: 'absolute',
                    left: addFaceDialog.screenX + 'px',
                    top: addFaceDialog.screenY + 'px',
                    transform: 'translate(-50%, -50%)',
                }"
                class="bg-white rounded shadow-xl p-2 z-50 border border-gray-300"
                @click.stop
            >
                <div class="flex items-center gap-2">
                    <input
                        ref="lengthInput"
                        type="number"
                        v-model.number="addFaceDialog.length"
                        class="border rounded px-2 py-1 text-sm w-20"
                        min="10"
                        max="800"
                        step="10"
                        @keyup.enter="handleConfirmAddFace"
                        @keyup.escape="addFaceDialog.visible = false"
                    />
                    <button
                        @click="handleConfirmAddFace"
                        class="bg-blue-500 text-white text-sm px-2 py-1 rounded hover:bg-blue-600"
                        title="Add Face"
                    >
                        ✓
                    </button>
                    <button
                        @click="addFaceDialog.visible = false"
                        class="bg-gray-300 text-gray-700 text-sm px-2 py-1 rounded hover:bg-gray-400"
                        title="Cancel"
                    >
                        ✕
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import init, { Modular } from 'nodi-modular'

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const cassetteGraph = await $fetch('/Cassette.json')

// Subgraph definition IDs from Cassette.json
const RECT_SUBGRAPH_ID = 'd8963104-a40a-4faf-9762-4dc76607da7d'
const GROW_SUBGRAPH_ID = '65f3238f-d937-45ce-bbee-494fc860ba3b'

/**
 * Generate a new UUID for node/parameter IDs
 */
const generateUUID = () => crypto.randomUUID()

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Nodi3D state
const modular = ref(null)
const currentGraph = ref(null)

// Rectangle dimensions
const rectWidth = ref(500)
const rectHeight = ref(600)

// Extrusions tracking
const extrusions = ref([]) // Array of { edge, length, growNodeId, growInstanceId, edgeNodeId, lengthNodeId }

// Node ID tracking
const rectWidthNodeId = ref(null)
const rectHeightNodeId = ref(null)
const rectSubgraphNodeId = ref(null)
const currentPolygonOutputId = ref(null)

// Rendered geometry
const extrusionShapes = ref([]) // Array of { path, centroid }
const currentPolygonPath = ref('')
const currentPolygonEdges = ref([]) // Array of { x1, y1, x2, y2, midX, midY }

// UI state
const hoveredEdge = ref(null)
const addFaceDialog = ref({
    visible: false,
    screenX: 0,
    screenY: 0,
    edgeIndex: null,
    length: 200,
})
const lengthInput = ref(null)

// View/zoom state
const viewBox = ref({ x: -800, y: -800, width: 1600, height: 1600 })
const baseViewBox = ref({ x: -800, y: -800, width: 1600, height: 1600 })
const svgElement = ref(null)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })

// ============================================================================
// GRAPH INITIALIZATION & MANAGEMENT
// ============================================================================

/**
 * Create initial graph with just the rectangle subgraph
 * @returns {Object} Graph structure with nodes and sub_graphs
 */
function createInitialGraph() {
    const graph = {
        nodes: {},
        sub_graphs: cassetteGraph.graph.sub_graphs,
    }

    // Reset instances arrays
    graph.sub_graphs[RECT_SUBGRAPH_ID].instances = []
    graph.sub_graphs[GROW_SUBGRAPH_ID].instances = []

    // Create width number node
    const widthId = generateUUID()
    const widthOutputId = generateUUID()
    graph.nodes[widthId] = {
        id: widthId,
        name: 'Number',
        label: 'Width',
        input: { parameters: [] },
        output: {
            parameters: [{
                id: widthOutputId,
                name: 'output value',
                access_type: 'Item',
                hint: 'Number',
                connections: [],
            }],
        },
        entity: {
            variant: 'Number',
            data: { value: rectWidth.value, integer: true, precision: 10 },
        },
        enabled: true,
        visible: true,
    }
    rectWidthNodeId.value = widthId

    // Create height number node
    const heightId = generateUUID()
    const heightOutputId = generateUUID()
    graph.nodes[heightId] = {
        id: heightId,
        name: 'Number',
        label: 'Height',
        input: { parameters: [] },
        output: {
            parameters: [{
                id: heightOutputId,
                name: 'output value',
                access_type: 'Item',
                hint: 'Number',
                connections: [],
            }],
        },
        entity: {
            variant: 'Number',
            data: { value: rectHeight.value, integer: true, precision: 10 },
        },
        enabled: true,
        visible: true,
    }
    rectHeightNodeId.value = heightId

    // Create rectangle subgraph instance
    const rectInstanceId = generateUUID()
    graph.sub_graphs[RECT_SUBGRAPH_ID].instances.push(rectInstanceId)
    
    const rectSubId = generateUUID()
    const rectInput0Id = generateUUID()
    const rectInput1Id = generateUUID()
    const rectOutputId = generateUUID()
    
    graph.nodes[rectSubId] = {
        id: rectSubId,
        name: 'Sub Graph',
        label: 'Rectangle!',
        input: {
            parameters: [
                {
                    id: rectInput0Id,
                    name: '0th target',
                    access_type: 'Tree',
                    hint: '',
                    connections: [widthOutputId],
                },
                {
                    id: rectInput1Id,
                    name: '1th target',
                    access_type: 'Tree',
                    hint: '',
                    connections: [heightOutputId],
                },
            ],
        },
        output: {
            parameters: [{
                id: rectOutputId,
                name: '0th output',
                access_type: 'Tree',
                hint: '',
                connections: [],
            }],
        },
        entity: {
            variant: 'SubGraph',
            data: { instance_id: rectInstanceId },
        },
        enabled: true,
        visible: true,
    }
    rectSubgraphNodeId.value = rectSubId
    currentPolygonOutputId.value = rectOutputId

    // Connect nodes (bidirectional)
    graph.nodes[widthId].output.parameters[0].connections = [rectInput0Id]
    graph.nodes[heightId].output.parameters[0].connections = [rectInput1Id]

    return graph
}

/**
 * Initialize nodi3d and load initial graph
 */
onMounted(async () => {
    try {
        await init()
        modular.value = Modular.new()

        currentGraph.value = createInitialGraph()
        modular.value.loadGraph(JSON.stringify(currentGraph.value))
        await evaluateGraph()
    } catch (error) {
        console.error('Failed to initialize nodi3d:', error)
    }
})

// ============================================================================
// NODI3D EVALUATION & GEOMETRY PROCESSING
// ============================================================================

/**
 * Evaluate the current graph and update rendered geometry
 * Uses heuristic: largest curve (most vertices) = current polygon
 */
async function evaluateGraph() {
    if (!modular.value) return

    try {
        const result = await modular.value.evaluate()
        const { geometryIdentifiers } = result

        console.log('=== EVALUATION ===')
        console.log('Geometries:', geometryIdentifiers.length, 'Extrusions:', extrusions.value.length)

        // Extract all curve geometries
        const allCurves = []
        geometryIdentifiers.forEach((id, idx) => {
            const interop = modular.value.findGeometryInteropById(id)
            if (interop?.variant === 'Curve') {
                const { vertices } = interop.data
                if (vertices && vertices.length > 0) {
                    allCurves.push({ vertices, id })
                    console.log(`Curve[${idx}]: ${vertices.length} vertices`)
                }
            }
        })

        if (allCurves.length === 0) return

        // HEURISTIC: Current polygon has the most vertices (rectangle + all extrusions)
        // Individual extrusion rectangles have only 4 vertices
        const sortedByVertices = [...allCurves].sort((a, b) => b.vertices.length - a.vertices.length)
        const currentPolygon = sortedByVertices[0]
        
        console.log('Current polygon:', currentPolygon.vertices.length, 'vertices')
        
        // Update current polygon display
        currentPolygonPath.value = verticesToSVGPath(currentPolygon.vertices)
        currentPolygonEdges.value = extractEdges(currentPolygon.vertices)

        // All other curves are extrusion shapes
        extrusionShapes.value = allCurves
            .filter(c => c !== currentPolygon)
            .map((c) => ({
                path: verticesToSVGPath(c.vertices),
                centroid: calculateCentroid(c.vertices),
            }))

        console.log('Extrusion shapes:', extrusionShapes.value.length)

        // Auto-fit view on first load
        if (baseViewBox.value.width === 1600) {
            updateViewBox(currentPolygon.vertices)
        }
    } catch (error) {
        console.error('Failed to evaluate graph:', error)
    }
}

/**
 * Convert vertices array to SVG path string
 * @param {Array<Array<number>>} vertices - Array of [x, y, z] coordinates
 * @returns {string} SVG path string
 */
function verticesToSVGPath(vertices) {
    if (vertices.length === 0) return ''

    const commands = vertices.map((v, idx) => {
        const [x, y] = v
        return idx === 0 ? `M ${x} ${-y}` : `L ${x} ${-y}` // Flip Y for SVG coords
    })

    return commands.join(' ') + ' Z'
}

/**
 * Extract edge information from vertices for interaction
 * @param {Array<Array<number>>} vertices
 * @returns {Array<Object>} Array of edge objects with positions and midpoints
 */
function extractEdges(vertices) {
    return vertices.map((v, idx) => {
        const next = vertices[(idx + 1) % vertices.length]
        return {
            x1: v[0],
            y1: -v[1],
            x2: next[0],
            y2: -next[1],
            midX: (v[0] + next[0]) / 2,
            midY: -(v[1] + next[1]) / 2,
        }
    })
}

/**
 * Calculate centroid (average position) of vertices
 * @param {Array<Array<number>>} vertices
 * @returns {Object|null} { x, y } or null if no vertices
 */
function calculateCentroid(vertices) {
    if (vertices.length === 0) return null
    const sumX = vertices.reduce((sum, v) => sum + v[0], 0)
    const sumY = vertices.reduce((sum, v) => sum + v[1], 0)
    return {
        x: sumX / vertices.length,
        y: -sumY / vertices.length,
    }
}

/**
 * Update viewBox to fit geometry with padding
 * @param {Array<Array<number>>} vertices
 */
function updateViewBox(vertices) {
    const padding = 200
    const xs = vertices.map((v) => v[0])
    const ys = vertices.map((v) => v[1])
    const minX = Math.min(...xs) - padding
    const maxX = Math.max(...xs) + padding
    const minY = Math.min(...ys) - padding
    const maxY = Math.max(...ys) + padding

    const box = {
        x: minX,
        y: -maxY,
        width: maxX - minX,
        height: maxY - minY,
    }

    viewBox.value = box
    baseViewBox.value = { ...box }
}

// ============================================================================
// EXTRUSION MANAGEMENT
// ============================================================================

/**
 * Add a new extrusion to the specified edge
 * @param {number} edgeIndex - Which edge to extrude from (0-based)
 * @param {number} length - Length of the extrusion
 */
async function addExtrusion(edgeIndex, length) {
    if (!modular.value || !currentGraph.value) return

    // Create edge index number node
    const edgeNodeId = generateUUID()
    const edgeOutputId = generateUUID()
    currentGraph.value.nodes[edgeNodeId] = {
        id: edgeNodeId,
        name: 'Number',
        label: `Edge ${edgeIndex}`,
        input: { parameters: [] },
        output: {
            parameters: [{
                id: edgeOutputId,
                name: 'output value',
                access_type: 'Item',
                hint: 'Number',
                connections: [],
            }],
        },
        entity: {
            variant: 'Number',
            data: { value: edgeIndex, integer: true, precision: 1 },
        },
        enabled: true,
        visible: true,
    }

    // Create length number node
    const lengthNodeId = generateUUID()
    const lengthOutputId = generateUUID()
    currentGraph.value.nodes[lengthNodeId] = {
        id: lengthNodeId,
        name: 'Number',
        label: `Length ${length}`,
        input: { parameters: [] },
        output: {
            parameters: [{
                id: lengthOutputId,
                name: 'output value',
                access_type: 'Item',
                hint: 'Number',
                connections: [],
            }],
        },
        entity: {
            variant: 'Number',
            data: { value: length, integer: true, precision: 1 },
        },
        enabled: true,
        visible: true,
    }

    // Create new instance of Grow Side Face subgraph
    const growInstanceId = generateUUID()
    currentGraph.value.sub_graphs[GROW_SUBGRAPH_ID].instances.push(growInstanceId)

    // Create Grow Side Face subgraph node
    const growNodeId = generateUUID()
    const growInput0Id = generateUUID()
    const growInput1Id = generateUUID()
    const growInput2Id = generateUUID()
    const growOutput0Id = generateUUID()
    const growOutput1Id = generateUUID()

    currentGraph.value.nodes[growNodeId] = {
        id: growNodeId,
        name: 'Sub Graph',
        label: 'Grow Side Face',
        input: {
            parameters: [
                {
                    id: growInput0Id,
                    name: '0th target',
                    access_type: 'Tree',
                    hint: '',
                    connections: [currentPolygonOutputId.value],
                },
                {
                    id: growInput1Id,
                    name: '1th target',
                    access_type: 'Tree',
                    hint: '',
                    connections: [edgeOutputId],
                },
                {
                    id: growInput2Id,
                    name: '2th target',
                    access_type: 'Tree',
                    hint: '',
                    connections: [lengthOutputId],
                },
            ],
        },
        output: {
            parameters: [
                {
                    id: growOutput0Id,
                    name: '0th output',
                    access_type: 'Tree',
                    hint: '',
                    connections: [],
                },
                {
                    id: growOutput1Id,
                    name: '1th output',
                    access_type: 'Tree',
                    hint: '',
                    connections: [],
                },
            ],
        },
        entity: {
            variant: 'SubGraph',
            data: { instance_id: growInstanceId },
        },
        enabled: true,
        visible: true,
    }

    // Update bidirectional connections
    currentGraph.value.nodes[edgeNodeId].output.parameters[0].connections = [growInput1Id]
    currentGraph.value.nodes[lengthNodeId].output.parameters[0].connections = [growInput2Id]

    // Connect previous node's output to this node's input
    for (const nodeId in currentGraph.value.nodes) {
        const node = currentGraph.value.nodes[nodeId]
        for (const param of node.output.parameters) {
            if (param.id === currentPolygonOutputId.value) {
                param.connections.push(growInput0Id)
                break
            }
        }
    }

    // Update current polygon to be this node's first output (union)
    currentPolygonOutputId.value = growOutput0Id

    // Store extrusion info for later removal
    extrusions.value.push({
        edge: edgeIndex,
        length,
        growNodeId,
        growInstanceId,
        edgeNodeId,
        lengthNodeId,
    })

    // Reload graph and re-evaluate
    modular.value.loadGraph(JSON.stringify(currentGraph.value))
    await evaluateGraph()
}

/**
 * Remove an extrusion and reconnect the chain
 * @param {number} idx - Index in extrusions array
 */
async function removeExtrusion(idx) {
    if (!currentGraph.value || !modular.value || idx < 0 || idx >= extrusions.value.length) return

    const ext = extrusions.value[idx]
    if (!ext) return

    const growNode = currentGraph.value.nodes[ext.growNodeId]
    if (!growNode) return

    // Get connection info for reconnection
    const inputParamId = growNode.input.parameters[0].connections[0] // From previous node
    const outputParamId = growNode.output.parameters[0].id // Our output

    // Find next node that uses our output
    let nextNodeInputParamId = null
    for (const nodeId in currentGraph.value.nodes) {
        const node = currentGraph.value.nodes[nodeId]
        if (!node || node.id === ext.growNodeId) continue
        
        for (const param of node.input.parameters) {
            if (param.connections.includes(outputParamId)) {
                nextNodeInputParamId = param.id
                break
            }
        }
        if (nextNodeInputParamId) break
    }

    // Reconnect: previous → next (bypassing this node)
    if (nextNodeInputParamId && inputParamId) {
        // Update previous node to connect to next instead of us
        for (const nodeId in currentGraph.value.nodes) {
            const node = currentGraph.value.nodes[nodeId]
            if (!node) continue
            
            for (const param of node.output.parameters) {
                if (param.id === inputParamId) {
                    param.connections = param.connections.filter(id => id !== growNode.input.parameters[0].id)
                    param.connections.push(nextNodeInputParamId)
                }
            }
        }
        
        // Update next node to connect from previous instead of us
        for (const nodeId in currentGraph.value.nodes) {
            const node = currentGraph.value.nodes[nodeId]
            if (!node) continue
            
            for (const param of node.input.parameters) {
                if (param.id === nextNodeInputParamId) {
                    param.connections = param.connections.filter(id => id !== outputParamId)
                    param.connections.push(inputParamId)
                }
            }
        }
    }

    // Update currentPolygonOutputId if removing last extrusion
    if (idx === extrusions.value.length - 1) {
        if (idx === 0) {
            // Was the only extrusion, go back to rectangle
            currentPolygonOutputId.value = currentGraph.value.nodes[rectSubgraphNodeId.value].output.parameters[0].id
        } else {
            // Go back to previous extrusion's first output
            const prevExt = extrusions.value[idx - 1]
            currentPolygonOutputId.value = currentGraph.value.nodes[prevExt.growNodeId].output.parameters[0].id
        }
    }

    // Remove instance from subgraph
    currentGraph.value.sub_graphs[GROW_SUBGRAPH_ID].instances = 
        currentGraph.value.sub_graphs[GROW_SUBGRAPH_ID].instances.filter(id => id !== ext.growInstanceId)

    // Remove the three nodes
    delete currentGraph.value.nodes[ext.growNodeId]
    delete currentGraph.value.nodes[ext.edgeNodeId]
    delete currentGraph.value.nodes[ext.lengthNodeId]

    // Remove from tracking array
    extrusions.value.splice(idx, 1)

    // Reload and re-evaluate
    modular.value.loadGraph(JSON.stringify(currentGraph.value))
    await evaluateGraph()
}

// ============================================================================
// USER INTERACTION HANDLERS
// ============================================================================

/**
 * Handle rectangle dimension change
 */
async function handleRectangleDimensionChange() {
    if (!modular.value || !currentGraph.value) return

    currentGraph.value.nodes[rectWidthNodeId.value].entity.data.value = rectWidth.value
    currentGraph.value.nodes[rectHeightNodeId.value].entity.data.value = rectHeight.value

    modular.value.loadGraph(JSON.stringify(currentGraph.value))
    await evaluateGraph()
}

/**
 * Handle click on edge to show add face dialog
 */
function handleAddFaceClick(edgeIndex, edge) {
    if (!svgElement.value) return

    // Convert SVG coordinates to screen coordinates
    const svg = svgElement.value
    const pt = svg.createSVGPoint()
    pt.x = edge.midX
    pt.y = edge.midY
    const screenPt = pt.matrixTransform(svg.getScreenCTM())

    addFaceDialog.value = {
        visible: true,
        screenX: screenPt.x,
        screenY: screenPt.y,
        edgeIndex,
        length: 200,
    }

    // Auto-focus and select input
    setTimeout(() => {
        lengthInput.value?.focus()
        lengthInput.value?.select()
    }, 50)
}

/**
 * Confirm and add the face from dialog
 */
async function handleConfirmAddFace() {
    const { edgeIndex, length } = addFaceDialog.value
    addFaceDialog.value.visible = false

    await addExtrusion(edgeIndex, length)
}

/**
 * Handle delete button click on extrusion
 */
async function handleDeleteExtrusion(idx) {
    await removeExtrusion(idx)
}

/**
 * Reset the entire design to initial state
 */
async function resetDesign() {
    extrusions.value = []
    hoveredEdge.value = null
    rectWidth.value = 500
    rectHeight.value = 600
    addFaceDialog.value.visible = false

    if (modular.value) {
        currentGraph.value = createInitialGraph()
        modular.value.loadGraph(JSON.stringify(currentGraph.value))
        await evaluateGraph()
    }
}

// ============================================================================
// VIEW/ZOOM CONTROLS
// ============================================================================

function handleMouseDown(event) {
    if (event.button === 0 && event.shiftKey) {
        isPanning.value = true
        panStart.value = { x: event.clientX, y: event.clientY }
        event.preventDefault()
    }
}

function handleMouseUp() {
    isPanning.value = false
}

function handleMouseMove(event) {
    if (isPanning.value) {
        const dx = (event.clientX - panStart.value.x) * (viewBox.value.width / svgElement.value.clientWidth)
        const dy = (event.clientY - panStart.value.y) * (viewBox.value.height / svgElement.value.clientHeight)

        viewBox.value = {
            ...viewBox.value,
            x: viewBox.value.x - dx,
            y: viewBox.value.y - dy,
        }

        panStart.value = { x: event.clientX, y: event.clientY }
    }
}

function handleWheel(event) {
    const delta = event.deltaY > 0 ? 1.1 : 0.9
    const box = viewBox.value

    const newWidth = box.width * delta
    const newHeight = box.height * delta
    const dx = (newWidth - box.width) / 2
    const dy = (newHeight - box.height) / 2

    viewBox.value = {
        x: box.x - dx,
        y: box.y - dy,
        width: newWidth,
        height: newHeight,
    }
}

function zoomIn() {
    const box = viewBox.value
    const scale = 0.8
    const newWidth = box.width * scale
    const newHeight = box.height * scale
    const dx = (box.width - newWidth) / 2
    const dy = (box.height - newHeight) / 2

    viewBox.value = {
        x: box.x + dx,
        y: box.y + dy,
        width: newWidth,
        height: newHeight,
    }
}

function zoomOut() {
    const box = viewBox.value
    const scale = 1.25
    const newWidth = box.width * scale
    const newHeight = box.height * scale
    const dx = (box.width - newWidth) / 2
    const dy = (box.height - newHeight) / 2

    viewBox.value = {
        x: box.x + dx,
        y: box.y + dy,
        width: newWidth,
        height: newHeight,
    }
}

function resetView() {
    viewBox.value = { ...baseViewBox.value }
}
</script>
