<template>
    <div class="h-full flex">
        <!-- Left Sidebar: Parameters & History -->
        <div class="w-80 border-r flex flex-col bg-surface-50">
            <div class="p-4 border-b font-bold uppercase text-xs text-surface-500 tracking-wider">Global Parameters</div>
            <div class="p-4 flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                    <label class="text-sm font-semibold text-surface-700">Width (A):</label>
                    <InputNumber v-model="cassetteData.params.A" @update:modelValue="rebuildAndEvaluate" class="w-full" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="text-sm font-semibold text-surface-700">Height (B):</label>
                    <InputNumber v-model="cassetteData.params.B" @update:modelValue="rebuildAndEvaluate" class="w-full" />
                </div>
            </div>

            <div class="p-4 border-b border-t font-bold uppercase text-xs text-surface-500 tracking-wider">History / Extrusions</div>
            <div class="flex-1 overflow-y-auto p-4">
                <div v-if="cassetteData.extrusions.length === 0" class="text-sm text-surface-400 text-center py-8">No extrusions yet. Click on an edge to add one.</div>
                <div v-else class="flex flex-col gap-2">
                    <div v-for="(ext, idx) in cassetteData.extrusions" :key="idx" class="p-3 bg-white border rounded-lg shadow-sm flex flex-col gap-2">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium">Edge {{ ext.edge }}</span>
                            <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeExtrusion(idx)" />
                        </div>
                        <div class="flex items-center gap-2">
                            <label class="text-xs text-surface-500">Depth:</label>
                            <InputNumber v-model="ext.length" @update:modelValue="rebuildAndEvaluate" size="small" class="w-full" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="p-4 border-t flex gap-2">
                <Button label="Reset" icon="pi pi-refresh" severity="secondary" outlined class="flex-1" @click="reset" />
                <Button label="Save" icon="pi pi-save" class="flex-1" @click="save" />
            </div>
        </div>

        <!-- Main Content: SVG Canvas -->
        <div class="flex-1 relative bg-surface-100 overflow-hidden">
            <div v-if="!modular" class="absolute inset-0 flex items-center justify-center bg-white/50 z-20 backdrop-blur-sm">
                <div class="flex flex-col items-center gap-2">
                    <i class="pi pi-spin pi-spinner text-3xl text-blue-500"></i>
                    <span class="text-sm font-medium">Initializing Geometry Engine...</span>
                </div>
            </div>

            <!-- Canvas Toolbar -->
            <div class="absolute top-4 right-4 z-10 flex gap-2 bg-white/80 backdrop-blur p-2 rounded-lg shadow-md border">
                <Button icon="pi pi-plus" @click="zoomIn" text rounded />
                <Button icon="pi pi-minus" @click="zoomOut" text rounded />
                <Button icon="pi pi-expand" @click="resetView" text rounded />
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
                @wheel.prevent="handleWheel"
            >
                <defs>
                    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e0e0e0" stroke-width="0.5" />
                    </pattern>
                </defs>
                <rect :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#grid)" />

                <!-- Extrusion Highlights -->
                <g v-for="(ext, idx) in extrusionShapes" :key="`ext-${idx}`">
                    <path :d="ext.path" fill="rgba(34, 197, 94, 0.05)" stroke="#22c55e" stroke-width="1" stroke-dasharray="4,4" style="pointer-events: none" />
                </g>

                <!-- Union Polygon -->
                <path v-if="currentPolygonPath" :d="currentPolygonPath" fill="white" fill-opacity="0.8" stroke="#3b82f6" stroke-width="2" />

                <!-- Interactive Edges -->
                <g v-for="(edge, idx) in currentPolygonEdges" :key="`edge-${idx}`">
                    <line
                        :x1="edge.x1"
                        :y1="edge.y1"
                        :x2="edge.x2"
                        :y2="edge.y2"
                        stroke="transparent"
                        stroke-width="12"
                        stroke-linecap="round"
                        class="cursor-pointer hover:stroke-blue-400/30"
                        @mouseenter="hoveredEdge = idx"
                        @mouseleave="hoveredEdge = null"
                        @click.stop="showAddFaceDialog(idx, edge)"
                    />
                    <g v-if="hoveredEdge === idx" class="pointer-events-none">
                        <circle :cx="edge.midX" :cy="edge.midY" r="10" fill="#3b82f6" stroke="white" stroke-width="2" />
                        <path d="M-4 0 L4 0 M0 -4 L0 4" :transform="`translate(${edge.midX}, ${edge.midY})`" stroke="white" stroke-width="2" stroke-linecap="round" />
                    </g>
                </g>
            </svg>

            <!-- Floating Add Dialog -->
            <div
                v-if="addDialog.visible"
                :style="{ position: 'absolute', left: addDialog.screenX + 'px', top: addDialog.screenY + 'px', transform: 'translate(-50%, -100%)' }"
                class="z-50 mb-4 bg-white shadow-2xl rounded-xl border p-2 flex items-center gap-2"
            >
                <InputNumber
                    v-model="addDialog.length"
                    :min="10"
                    :max="2000"
                    class="w-32"
                    size="small"
                    placeholder="Depth"
                    ref="addInput"
                    @keyup.enter="confirmAdd"
                    @keyup.escape="addDialog.visible = false"
                />
                <Button icon="pi pi-check" size="small" @click="confirmAdd" />
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, onMounted, reactive, computed } from 'vue'
    import Button from 'primevue/button'
    import InputNumber from 'primevue/inputnumber'
    import init, { Modular } from 'nodi-modular'
    import { buildNodiGraph } from '~/utils/cassetteGraphBuilder'

    // State
    const modular = ref(null)
    const templateGraph = ref(null)
    const cassetteData = reactive({
        params: { A: 600, B: 600 },
        extrusions: [],
    })

    // UI State
    const hoveredEdge = ref(null)
    const addDialog = reactive({
        visible: false,
        screenX: 0,
        screenY: 0,
        edgeIndex: null,
        length: 200,
    })
    const addInput = ref(null)

    // Geometry Data
    const currentPolygonPath = ref('')
    const currentPolygonEdges = ref([])
    const extrusionShapes = ref([])

    // Viewport State
    const svgElement = ref(null)
    const viewBox = ref({ x: -800, y: -800, width: 1600, height: 1600 })
    const isPanning = ref(false)
    const panStart = ref({ x: 0, y: 0 })

    onMounted(async () => {
        try {
            await init()
            modular.value = Modular.new()
            templateGraph.value = await $fetch('/Cassette.json')
            await rebuildAndEvaluate()
        } catch (error) {
            console.error('Initialization failed:', error)
        }
    })

    const rebuildAndEvaluate = async () => {
        if (!modular.value || !templateGraph.value) return

        const { graph, extrusionOutputIds } = buildNodiGraph(cassetteData, templateGraph.value)
        modular.value.loadGraph(JSON.stringify(graph))

        try {
            const result = await modular.value.evaluate()
            const { geometryIdentifiers } = result

            const allCurves = []
            geometryIdentifiers.forEach((id) => {
                const interop = modular.value.findGeometryInteropById(id)
                if (interop?.variant === 'Curve' && interop.data.vertices?.length > 0) {
                    allCurves.push({ vertices: interop.data.vertices, id })
                }
            })

            if (allCurves.length === 0) return

            // Heuristic to find the largest (union) polygon
            const sorted = [...allCurves].sort((a, b) => b.vertices.length - a.vertices.length)
            const largest = sorted[0]

            currentPolygonPath.value = verticesToSVGPath(largest.vertices)
            currentPolygonEdges.value = extractEdges(largest.vertices)

            // Other 5-vertex curves are individual face rectangles
            extrusionShapes.value = allCurves
                .filter((c) => c !== largest && c.vertices.length === 5)
                .map((c) => ({
                    path: verticesToSVGPath(c.vertices),
                }))
        } catch (e) {
            console.error('Evaluation failed:', e)
        }
    }

    const verticesToSVGPath = (vertices) => {
        if (!vertices.length) return ''
        const commands = vertices.map((v, i) => (i === 0 ? `M ${v[0]} ${-v[1]}` : `L ${v[0]} ${-v[1]}`))
        return commands.join(' ') + ' Z'
    }

    const extractEdges = (vertices) => {
        return vertices.map((v, i) => {
            const next = vertices[(i + 1) % vertices.length]
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

    const showAddFaceDialog = (edgeIndex, edge) => {
        if (!svgElement.value) return
        const svg = svgElement.value
        const pt = svg.createSVGPoint()
        pt.x = edge.midX
        pt.y = edge.midY
        const screenPt = pt.matrixTransform(svg.getScreenCTM())

        addDialog.visible = true
        addDialog.screenX = screenPt.x
        addDialog.screenY = screenPt.y
        addDialog.edgeIndex = edgeIndex

        setTimeout(() => addInput.value?.$el?.querySelector('input')?.focus(), 50)
    }

    const confirmAdd = async () => {
        cassetteData.extrusions.push({
            edge: addDialog.edgeIndex,
            length: addDialog.length,
        })
        addDialog.visible = false
        await rebuildAndEvaluate()
    }

    const removeExtrusion = async (idx) => {
        cassetteData.extrusions.splice(idx, 1)
        await rebuildAndEvaluate()
    }

    const reset = async () => {
        cassetteData.params = { A: 600, B: 600 }
        cassetteData.extrusions = []
        await rebuildAndEvaluate()
    }

    // Viewport Controls
    const zoomIn = () => {
        viewBox.value.width *= 0.8
        viewBox.value.height *= 0.8
    }
    const zoomOut = () => {
        viewBox.value.width *= 1.25
        viewBox.value.height *= 1.25
    }
    const resetView = () => {
        viewBox.value = { x: -800, y: -800, width: 1600, height: 1600 }
    }
    const handleWheel = (e) => {
        const delta = e.deltaY > 0 ? 1.1 : 0.9
        viewBox.value.width *= delta
        viewBox.value.height *= delta
    }
    const handleMouseDown = (e) => {
        if (e.button === 0 && e.shiftKey) {
            isPanning.value = true
            panStart.value = { x: e.clientX, y: e.clientY }
            e.preventDefault()
        }
    }
    const handleMouseMove = (e) => {
        if (isPanning.value) {
            const dx = (e.clientX - panStart.value.x) * (viewBox.value.width / svgElement.value.clientWidth)
            const dy = (e.clientY - panStart.value.y) * (viewBox.value.height / svgElement.value.clientHeight)
            viewBox.value.x -= dx
            viewBox.value.y -= dy
            panStart.value = { x: e.clientX, y: e.clientY }
        }
    }
    const handleMouseUp = () => (isPanning.value = false)

    const save = () => {
        console.log('Saving cassette data:', JSON.stringify(cassetteData))
        // Implement actual save logic here
    }
</script>