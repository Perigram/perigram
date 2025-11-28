<template>
    <div class="h-full flex flex-col">
        <!-- Top controls -->
        <div class="flex items-center gap-4 p-4 border-b">
            <div v-if="!modular" class="text-sm">Loading nodi3d...</div>
            <template v-else>
                <div class="flex items-center gap-2">
                    <label class="text-sm font-semibold">Width:</label>
                    <InputNumber
                        v-model="rectWidth"
                        :min="100"
                        :max="1000"
                        :step="50"
                        @update:modelValue="updateRectangleDimensions"
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
                        @update:modelValue="updateRectangleDimensions"
                        class="w-24"
                    />
                </div>
                <div class="ml-auto flex gap-2">
                    <Button icon="pi pi-plus" @click="zoomIn" size="small" />
                    <Button icon="pi pi-minus" @click="zoomOut" size="small" />
                    <Button icon="pi pi-refresh" @click="resetView" size="small" />
                    <Button label="Reset" icon="pi pi-replay" @click="reset" severity="secondary" size="small" />
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
                <!-- Grid -->
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

                <!-- Individual extrusions with delete buttons -->
                <g v-for="(ext, idx) in extrusionShapes" :key="`ext-${idx}`">
                    <path
                        :d="ext.path"
                        fill="rgba(34, 197, 94, 0.2)"
                        stroke="#22c55e"
                        stroke-width="1.5"
                    />
                    <!-- Delete button at centroid -->
                    <g
                        v-if="ext.centroid"
                        @click.stop="removeExtrusion(idx)"
                        class="cursor-pointer"
                        style="pointer-events: all"
                    >
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

                <!-- Current polygon outline -->
                <path
                    v-if="currentPolygonPath"
                    :d="currentPolygonPath"
                    fill="none"
                    stroke="#3b82f6"
                    stroke-width="2"
                />

                <!-- Add face buttons on each edge -->
                <g v-for="(edge, idx) in currentPolygonEdges" :key="`edge-${idx}`">
                    <!-- Edge hover area -->
                    <line
                        :x1="edge.x1"
                        :y1="edge.y1"
                        :x2="edge.x2"
                        :y2="edge.y2"
                        :stroke="hoveredEdge === idx ? '#f59e0b' : 'transparent'"
                        stroke-width="10"
                        stroke-linecap="round"
                        class="cursor-pointer"
                        @mouseenter="hoveredEdge = idx"
                        @mouseleave="hoveredEdge = null"
                        @click.stop="showAddFaceDialog(idx, edge)"
                    />
                    <!-- Add button at edge midpoint -->
                    <g
                        v-if="hoveredEdge === idx"
                        @click.stop="showAddFaceDialog(idx, edge)"
                        class="cursor-pointer"
                        style="pointer-events: all"
                    >
                        <circle
                            :cx="edge.midX"
                            :cy="edge.midY"
                            r="15"
                            fill="rgba(59, 130, 246, 0.9)"
                            stroke="white"
                            stroke-width="2"
                        />
                        <line
                            :x1="edge.midX"
                            :y1="edge.midY - 8"
                            :x2="edge.midX"
                            :y2="edge.midY + 8"
                            stroke="white"
                            stroke-width="2.5"
                            stroke-linecap="round"
                        />
                        <line
                            :x1="edge.midX - 8"
                            :y1="edge.midY"
                            :x2="edge.midX + 8"
                            :y2="edge.midY"
                            stroke="white"
                            stroke-width="2.5"
                            stroke-linecap="round"
                        />
                    </g>
                </g>
            </svg>

            <!-- Add face dialog - outside SVG for fixed positioning -->
            <div
                v-if="addFaceDialog.visible"
                :style="{
                    position: 'absolute',
                    left: addFaceDialog.screenX + 'px',
                    top: addFaceDialog.screenY + 'px',
                    transform: 'translate(-50%, -50%)',
                }"
                class="bg-white border-2 border-blue-500 rounded-lg shadow-lg p-3 z-50"
                @click.stop
            >
                <div class="flex flex-col gap-2" style="width: 200px">
                    <label class="text-xs font-semibold">Extrusion Length (mm)</label>
                    <input
                        ref="lengthInput"
                        type="number"
                        v-model.number="addFaceDialog.length"
                        class="border rounded px-2 py-1 text-sm"
                        min="10"
                        max="800"
                        step="10"
                        @keyup.enter="confirmAddFace"
                        @keyup.escape="addFaceDialog.visible = false"
                    />
                    <div class="flex gap-2">
                        <button
                            @click="confirmAddFace"
                            class="flex-1 bg-blue-500 text-white text-sm px-3 py-1 rounded hover:bg-blue-600 font-medium"
                        >
                            Add Face
                        </button>
                        <button
                            @click="addFaceDialog.visible = false"
                            class="flex-1 bg-gray-300 text-gray-700 text-sm px-3 py-1 rounded hover:bg-gray-400"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, onMounted } from 'vue'
    import Button from 'primevue/button'
    import InputNumber from 'primevue/inputnumber'
    import Divider from 'primevue/divider'
    import init, { Modular } from 'nodi-modular'

    const cassetteGraph = await $fetch('/Cassette.json')

    // Subgraph definition IDs
    const RECT_SUBGRAPH_ID = 'd8963104-a40a-4faf-9762-4dc76607da7d'
    const GROW_SUBGRAPH_ID = '65f3238f-d937-45ce-bbee-494fc860ba3b'

    const generateUUID = () => {
        return crypto.randomUUID()
    }

    // State
    const modular = ref(null)
    const currentGraph = ref(null)
    const rectWidth = ref(500)
    const rectHeight = ref(600)
    const extrusions = ref([])
    const hoveredEdge = ref(null)

    // Track node IDs
    const rectWidthNodeId = ref(null)
    const rectHeightNodeId = ref(null)
    const rectSubgraphNodeId = ref(null)
    const currentPolygonOutputId = ref(null)

    // Geometry data from nodi3d - track by node output
    const geometryByOutput = ref(new Map())
    const extrusionShapes = ref([])
    const currentPolygonPath = ref('')
    const currentPolygonEdges = ref([])
    
    // Add face dialog
    const addFaceDialog = ref({
        visible: false,
        screenX: 0,
        screenY: 0,
        edgeIndex: null,
        length: 200,
    })
    
    const lengthInput = ref(null)
    
    const viewBox = ref({ x: -800, y: -800, width: 1600, height: 1600 })
    const baseViewBox = ref({ x: -800, y: -800, width: 1600, height: 1600 })

    // Pan/zoom state
    const svgElement = ref(null)
    const isPanning = ref(false)
    const panStart = ref({ x: 0, y: 0 })

    // Create initial graph with just rectangle
    const createInitialGraph = () => {
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
                parameters: [
                    {
                        id: widthOutputId,
                        name: 'output value',
                        access_type: 'Item',
                        hint: 'Number',
                        connections: [],
                    },
                ],
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
                parameters: [
                    {
                        id: heightOutputId,
                        name: 'output value',
                        access_type: 'Item',
                        hint: 'Number',
                        connections: [],
                    },
                ],
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
                parameters: [
                    {
                        id: rectOutputId,
                        name: '0th output',
                        access_type: 'Tree',
                        hint: '',
                        connections: [],
                    },
                ],
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

        // Connect width and height to rectangle
        graph.nodes[widthId].output.parameters[0].connections = [rectInput0Id]
        graph.nodes[heightId].output.parameters[0].connections = [rectInput1Id]

        return graph
    }

    // Initialize nodi3d
    onMounted(async () => {
        try {
            await init()
            modular.value = Modular.new()

            currentGraph.value = createInitialGraph()
            modular.value.loadGraph(JSON.stringify(currentGraph.value))
            await evaluate()
        } catch (error) {
            console.error('Failed to initialize nodi3d:', error)
        }
    })

    const updateRectangleDimensions = async () => {
        if (!modular.value || !currentGraph.value) return

        currentGraph.value.nodes[rectWidthNodeId.value].entity.data.value = rectWidth.value
        currentGraph.value.nodes[rectHeightNodeId.value].entity.data.value = rectHeight.value

        modular.value.loadGraph(JSON.stringify(currentGraph.value))
        await evaluate()
    }

    const evaluate = async () => {
        if (!modular.value) return

        try {
            const result = await modular.value.evaluate()
            const { geometryIdentifiers } = result

            console.log('Evaluation - geometry count:', geometryIdentifiers.length)
            console.log('Extrusions count:', extrusions.value.length)

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

            console.log('Found curves:', allCurves.length)

            if (allCurves.length > 0) {
                // We should have: 1 current polygon + N extrusions
                // Current polygon is the one from currentPolygonOutputId
                // But geometryIdentifiers don't map to output IDs directly
                // So we assume: last curve = current polygon, others = extrusions
                
                const currentPolygon = allCurves[allCurves.length - 1]
                currentPolygonPath.value = verticesToSVGPath(currentPolygon.vertices)
                currentPolygonEdges.value = extractEdges(currentPolygon.vertices)

                // All other curves are individual extrusions (second outputs)
                // Skip first curve if we have no extrusions (it's the rectangle)
                extrusionShapes.value = allCurves.slice(0, -1).map((c) => ({
                    path: verticesToSVGPath(c.vertices),
                    centroid: calculateCentroid(c.vertices),
                }))

                if (baseViewBox.value.width === 1600) {
                    updateViewBox(currentPolygon.vertices)
                }
            }
        } catch (error) {
            console.error('Failed to evaluate graph:', error)
        }
    }

    const verticesToSVGPath = (vertices) => {
        if (vertices.length === 0) return ''

        const commands = vertices.map((v, idx) => {
            const [x, y] = v
            return idx === 0 ? `M ${x} ${-y}` : `L ${x} ${-y}`
        })

        return commands.join(' ') + ' Z'
    }

    const extractEdges = (vertices) => {
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

    const calculateCentroid = (vertices) => {
        if (vertices.length === 0) return null
        const sumX = vertices.reduce((sum, v) => sum + v[0], 0)
        const sumY = vertices.reduce((sum, v) => sum + v[1], 0)
        return {
            x: sumX / vertices.length,
            y: -sumY / vertices.length,
        }
    }

    const updateViewBox = (vertices) => {
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

    const handleMouseDown = (event) => {
        if (event.button === 0 && event.shiftKey) {
            isPanning.value = true
            panStart.value = { x: event.clientX, y: event.clientY }
            event.preventDefault()
        }
    }

    const handleMouseUp = () => {
        isPanning.value = false
    }

    const handleWheel = (event) => {
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

    const zoomIn = () => {
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

    const zoomOut = () => {
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

    const resetView = () => {
        viewBox.value = { ...baseViewBox.value }
    }

    const handleMouseMove = (event) => {
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

    const showAddFaceDialog = (edgeIndex, edge) => {
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

        // Focus input after dialog appears
        setTimeout(() => {
            lengthInput.value?.focus()
            lengthInput.value?.select()
        }, 50)
    }

    const confirmAddFace = async () => {
        const { edgeIndex, length } = addFaceDialog.value
        addFaceDialog.value.visible = false

        await addExtrusion(edgeIndex, length)
    }

    const addExtrusion = async (edgeIndex, length) => {
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
                parameters: [
                    {
                        id: edgeOutputId,
                        name: 'output value',
                        access_type: 'Item',
                        hint: 'Number',
                        connections: [],
                    },
                ],
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
                parameters: [
                    {
                        id: lengthOutputId,
                        name: 'output value',
                        access_type: 'Item',
                        hint: 'Number',
                        connections: [],
                    },
                ],
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

        // Update connections
        currentGraph.value.nodes[edgeNodeId].output.parameters[0].connections = [growInput1Id]
        currentGraph.value.nodes[lengthNodeId].output.parameters[0].connections = [growInput2Id]

        for (const nodeId in currentGraph.value.nodes) {
            const node = currentGraph.value.nodes[nodeId]
            for (const param of node.output.parameters) {
                if (param.id === currentPolygonOutputId.value) {
                    param.connections.push(growInput0Id)
                    break
                }
            }
        }

        // Update current polygon to be the new output
        currentPolygonOutputId.value = growOutput0Id

        // Store extrusion info
        extrusions.value.push({
            edge: edgeIndex,
            length,
            growNodeId,
            growInstanceId,
            edgeNodeId,
            lengthNodeId,
        })

        // Reload graph and evaluate
        modular.value.loadGraph(JSON.stringify(currentGraph.value))
        await evaluate()
    }

    const removeExtrusion = async (idx) => {
        if (!currentGraph.value || !modular.value || idx < 0 || idx >= extrusions.value.length) return

        const ext = extrusions.value[idx]
        if (!ext) return

        // Remove instance from subgraph instances array
        currentGraph.value.sub_graphs[GROW_SUBGRAPH_ID].instances = 
            currentGraph.value.sub_graphs[GROW_SUBGRAPH_ID].instances.filter(id => id !== ext.growInstanceId)

        // Remove the three nodes
        delete currentGraph.value.nodes[ext.growNodeId]
        delete currentGraph.value.nodes[ext.edgeNodeId]
        delete currentGraph.value.nodes[ext.lengthNodeId]

        // Update current polygon output ID
        if (idx === extrusions.value.length - 1) {
            // Removing last extrusion
            if (idx === 0) {
                // Was the only extrusion, go back to rectangle
                currentPolygonOutputId.value = currentGraph.value.nodes[rectSubgraphNodeId.value].output.parameters[0].id
            } else {
                // Go back to previous extrusion's output
                const prevExt = extrusions.value[idx - 1]
                currentPolygonOutputId.value = currentGraph.value.nodes[prevExt.growNodeId].output.parameters[0].id
            }
        }

        // Clean up connections - check if node exists before accessing it
        for (const nodeId in currentGraph.value.nodes) {
            const node = currentGraph.value.nodes[nodeId]
            if (!node) continue
            
            if (node.output?.parameters) {
                for (const param of node.output.parameters) {
                    param.connections = param.connections.filter((connId) => {
                        // Keep connection if target node still exists
                        return !Object.values(currentGraph.value.nodes).some(n => 
                            n?.input?.parameters?.some(p => p.id === connId && n.id === ext.growNodeId)
                        )
                    })
                }
            }
            
            if (node.input?.parameters) {
                for (const param of node.input.parameters) {
                    param.connections = param.connections.filter((connId) => {
                        // Keep connection if source node still exists
                        return !Object.values(currentGraph.value.nodes).some(n => 
                            n?.output?.parameters?.some(p => p.id === connId && n.id === ext.growNodeId)
                        )
                    })
                }
            }
        }

        extrusions.value.splice(idx, 1)

        modular.value.loadGraph(JSON.stringify(currentGraph.value))
        await evaluate()
    }

    const reset = async () => {
        extrusions.value = []
        hoveredEdge.value = null
        rectWidth.value = 500
        rectHeight.value = 600
        addFaceDialog.value.visible = false

        if (modular.value) {
            currentGraph.value = createInitialGraph()
            modular.value.loadGraph(JSON.stringify(currentGraph.value))
            await evaluate()
        }
    }
</script>
