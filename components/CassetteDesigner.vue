<template>
    <div class="flex gap-4 h-full">
        <!-- Controls Panel -->
        <div class="w-64 flex flex-col gap-4">
            <div
                v-if="!modular"
                class="text-sm"
            >
                Loading nodi3d...
            </div>

            <template v-else>
                <div class="flex flex-col gap-2">
                    <label class="font-semibold">Rectangle Width</label>
                    <InputNumber
                        v-model="rectWidth"
                        :min="100"
                        :max="1000"
                        :step="50"
                        @update:modelValue="updateRectangleDimensions"
                    />
                </div>

                <div class="flex flex-col gap-2">
                    <label class="font-semibold">Rectangle Height</label>
                    <InputNumber
                        v-model="rectHeight"
                        :min="100"
                        :max="1000"
                        :step="50"
                        @update:modelValue="updateRectangleDimensions"
                    />
                </div>

                <Divider />

                <div class="flex flex-col gap-2">
                    <label class="font-semibold">Extrusion Length</label>
                    <InputNumber
                        v-model="extrusionLength"
                        :min="10"
                        :max="800"
                        :step="10"
                    />
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
                    <div
                        v-if="extrusions.length === 0"
                        class="text-sm opacity-60"
                    >
                        Click edge on shape to select, then add extrusion
                    </div>
                    <div
                        v-for="(ext, idx) in extrusions"
                        :key="idx"
                        class="flex items-center gap-2 text-sm"
                    >
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
                <Button
                    icon="pi pi-plus"
                    @click="zoomIn"
                    size="small"
                />
                <Button
                    icon="pi pi-minus"
                    @click="zoomOut"
                    size="small"
                />
                <Button
                    icon="pi pi-refresh"
                    @click="resetView"
                    size="small"
                />
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
                    <pattern
                        id="grid"
                        width="50"
                        height="50"
                        patternUnits="userSpaceOnUse"
                    >
                        <path
                            d="M 50 0 L 0 0 0 50"
                            fill="none"
                            stroke="#e0e0e0"
                            stroke-width="0.5"
                        />
                    </pattern>
                </defs>
                <rect
                    :x="viewBox.x"
                    :y="viewBox.y"
                    :width="viewBox.width"
                    :height="viewBox.height"
                    fill="url(#grid)"
                />

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
    import { ref, onMounted } from 'vue'
    import Button from 'primevue/button'
    import InputNumber from 'primevue/inputnumber'
    import Divider from 'primevue/divider'
    import init, { Modular } from 'nodi-modular'

    const cassetteGraph = await $fetch('/Cassette.json')

    // Extract templates from full graph
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
    const extrusionLength = ref(400)
    const extrusions = ref([])
    const hoveredEdge = ref(null)
    const selectedEdge = ref(null)

    // Track node IDs
    const rectWidthNodeId = ref(null)
    const rectHeightNodeId = ref(null)
    const rectSubgraphNodeId = ref(null)
    const currentPolygonOutputId = ref(null)

    // Geometry data from nodi3d
    const extrusionPaths = ref([])
    const unionPath = ref('')
    const edges = ref([])
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

        // Create rectangle subgraph node
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
                data: { instance_id: RECT_SUBGRAPH_ID },
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

            const curves = []

            geometryIdentifiers.forEach((id) => {
                const interop = modular.value.findGeometryInteropById(id)

                if (interop?.variant === 'Curve') {
                    const { vertices } = interop.data
                    if (vertices && vertices.length > 0) {
                        curves.push({ vertices, id })
                    }
                }
            })

            if (curves.length > 0) {
                const lastCurve = curves[curves.length - 1]
                unionPath.value = verticesToSVGPath(lastCurve.vertices)
                updateEdgesFromCurve(lastCurve.vertices)

                extrusionPaths.value = curves.slice(0, -1).map((c) => verticesToSVGPath(c.vertices))

                if (baseViewBox.value.width === 1600) {
                    updateViewBox(lastCurve.vertices)
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

    const updateEdgesFromCurve = (vertices) => {
        edges.value = vertices.map((v, idx) => {
            const next = vertices[(idx + 1) % vertices.length]
            return {
                x1: v[0],
                y1: -v[1],
                x2: next[0],
                y2: -next[1],
            }
        })
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

    const getEdgeColor = (idx) => {
        if (selectedEdge.value === idx) return '#ef4444'
        if (hoveredEdge.value === idx) return '#f59e0b'
        return '#3b82f6'
    }

    const getEdgeWidth = (idx) => {
        if (selectedEdge.value === idx || hoveredEdge.value === idx) return 4
        return 2
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
            return
        }

        const svg = event.currentTarget
        const pt = svg.createSVGPoint()
        pt.x = event.clientX
        pt.y = event.clientY
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse())

        let closestIdx = null
        let minDist = 20

        edges.value.forEach((edge, idx) => {
            const dist = distanceToSegment(svgP.x, svgP.y, edge.x1, edge.y1, edge.x2, edge.y2)
            if (dist < minDist) {
                minDist = dist
                closestIdx = idx
            }
        })

        hoveredEdge.value = closestIdx
    }

    const handleClick = () => {
        if (!isPanning.value && hoveredEdge.value !== null) {
            selectedEdge.value = hoveredEdge.value
        }
    }

    const distanceToSegment = (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1
        const dy = y2 - y1
        const l2 = dx * dx + dy * dy
        if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)

        let t = ((px - x1) * dx + (py - y1) * dy) / l2
        t = Math.max(0, Math.min(1, t))

        const projX = x1 + t * dx
        const projY = y1 + t * dy

        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
    }

    const addExtrusion = async () => {
        if (selectedEdge.value === null || !modular.value || !currentGraph.value) return

        // Create edge index number node
        const edgeNodeId = generateUUID()
        const edgeOutputId = generateUUID()
        currentGraph.value.nodes[edgeNodeId] = {
            id: edgeNodeId,
            name: 'Number',
            label: `Edge ${selectedEdge.value}`,
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
                data: { value: selectedEdge.value, integer: true, precision: 1 },
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
            label: `Length ${extrusionLength.value}`,
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
                data: { value: extrusionLength.value, integer: true, precision: 1 },
            },
            enabled: true,
            visible: true,
        }

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
                data: { instance_id: GROW_SUBGRAPH_ID },
            },
            enabled: true,
            visible: true,
        }

        // Update connections - find node with current polygon output and add connection
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
            edge: selectedEdge.value,
            length: extrusionLength.value,
            growNodeId,
            edgeNodeId,
            lengthNodeId,
        })

        // Reload graph and evaluate
        modular.value.loadGraph(JSON.stringify(currentGraph.value))
        await evaluate()

        selectedEdge.value = null
    }

    const removeExtrusion = async (idx) => {
        if (!currentGraph.value || !modular.value) return

        const ext = extrusions.value[idx]

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

        // Clean up connections
        for (const nodeId in currentGraph.value.nodes) {
            const node = currentGraph.value.nodes[nodeId]
            for (const param of node.output.parameters) {
                param.connections = param.connections.filter(
                    (connId) =>
                        !currentGraph.value.nodes[ext.growNodeId] ||
                        !currentGraph.value.nodes[ext.growNodeId].input.parameters.some((p) => p.id === connId),
                )
            }
            for (const param of node.input.parameters) {
                param.connections = param.connections.filter(
                    (connId) =>
                        !currentGraph.value.nodes[ext.growNodeId] ||
                        !currentGraph.value.nodes[ext.growNodeId].output.parameters.some((p) => p.id === connId),
                )
            }
        }

        extrusions.value.splice(idx, 1)

        modular.value.loadGraph(JSON.stringify(currentGraph.value))
        await evaluate()
    }

    const reset = async () => {
        extrusions.value = []
        selectedEdge.value = null
        hoveredEdge.value = null
        rectWidth.value = 500
        rectHeight.value = 600
        extrusionLength.value = 400

        if (modular.value) {
            currentGraph.value = createInitialGraph()
            modular.value.loadGraph(JSON.stringify(currentGraph.value))
            await evaluate()
        }
    }
</script>
