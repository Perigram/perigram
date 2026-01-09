<template>
    <div class="h-full flex overflow-hidden bg-[var(--background-primary)] text-[var(--label-primary)]">
        <!-- Left Sidebar: Parameters & History -->
        <div class="w-80 border-r border-[var(--separator-primary)] flex flex-col bg-[var(--fill-tertiary)]">
            <div class="p-4 border-b border-[var(--separator-primary)] font-bold uppercase text-[10px] text-[var(--label-tertiary)] tracking-widest flex justify-between items-center">
                <span>Cassette Parameters</span>
                <Button icon="pi pi-plus" text size="small" @click="showAddParamDialog = true" class="h-6 w-6 text-[var(--label-secondary)]" />
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar">
                <!-- Global Dimensions -->
                <div class="p-4 flex flex-col gap-4 border-b border-[var(--separator-primary)]">
                    <div v-for="(val, key) in cassetteData.params" :key="key" class="flex flex-col gap-1.5">
                        <div class="flex justify-between items-center">
                            <label class="text-[11px] font-bold text-[var(--label-secondary)]">{{ key }}</label>
                            <span class="text-[10px] text-[var(--label-tertiary)]">{{ getParamType(key) }}</span>
                        </div>
                        <InputNumber 
                            v-model="cassetteData.params[key]" 
                            @update:modelValue="rebuildAndEvaluate" 
                            class="w-full" 
                            size="small"
                        />
                    </div>
                </div>

                <!-- Extrusion History -->
                <div class="p-4 border-b border-[var(--separator-primary)] font-bold uppercase text-[10px] text-[var(--label-tertiary)] tracking-widest text-[var(--label-tertiary)]">
                    Faces & Flanges
                </div>
                <div class="p-2 flex flex-col gap-1">
                    <div v-if="cassetteData.extrusions.length === 0" class="text-[11px] text-[var(--label-tertiary)] text-center py-12 px-4 italic leading-relaxed">
                        No faces or flanges yet.<br>Click on an edge to start growing.
                    </div>
                    <div v-for="(ext, idx) in cassetteData.extrusions" :key="idx" 
                        class="group p-3 rounded-lg border border-transparent hover:border-[var(--separator-secondary)] hover:bg-[var(--fill-secondary)] transition-all flex flex-col gap-2"
                        @mouseenter="highlightExtrusion(idx)"
                        @mouseleave="highlightExtrusion(null)"
                    >
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[var(--background-primary)]">{{ ext.param }}</span>
                                <span class="text-[10px] text-[var(--label-tertiary)]">Edge {{ ext.edge }}</span>
                            </div>
                            <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeExtrusion(idx)" class="opacity-0 group-hover:opacity-100 h-7 w-7" />
                        </div>
                        <div class="flex items-center gap-2">
                            <Select 
                                v-model="ext.param" 
                                :options="availableParams" 
                                class="flex-1 h-8 text-[11px]" 
                                @change="rebuildAndEvaluate"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sidebar Footer -->
            <div class="p-4 border-t border-[var(--separator-primary)] flex gap-2 bg-[var(--background-primary)]">
                <Button label="Reset" icon="pi pi-refresh" severity="secondary" outlined class="flex-1 h-10 text-[11px] font-bold uppercase" @click="reset" />
                <Button label="Save" icon="pi pi-save" class="flex-1 h-10 text-[11px] font-bold uppercase bg-[var(--accent-primary)] text-[var(--background-primary)] border-none" @click="save" />
            </div>
        </div>

        <!-- Main Content: SVG Canvas -->
        <div class="flex-1 relative overflow-hidden">
            <div v-if="!modular" class="absolute inset-0 flex items-center justify-center bg-[var(--background-primary)]/80 z-20 backdrop-blur-md">
                <div class="flex flex-col items-center gap-3">
                    <ProgressSpinner style="width: 40px; height: 40px" />
                    <span class="text-[11px] font-bold uppercase tracking-widest text-[var(--label-tertiary)]">Initializing Engine</span>
                </div>
            </div>

            <!-- Canvas Toolbar -->
            <div class="absolute top-6 right-6 z-10 flex flex-col gap-2">
                <div class="flex gap-1 bg-[var(--background-primary)]/60 backdrop-blur-xl p-1.5 rounded-xl shadow-2xl border border-[var(--separator-primary)]">
                    <Button icon="pi pi-plus" @click="zoomIn" text rounded class="h-9 w-9 text-[var(--label-secondary)]" />
                    <Button icon="pi pi-minus" @click="zoomOut" text rounded class="h-9 w-9 text-[var(--label-secondary)]" />
                    <Button icon="pi pi-expand" @click="resetView" text rounded class="h-9 w-9 text-[var(--label-secondary)]" />
                </div>
            </div>

            <svg
                ref="svgElement"
                :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
                :class="isPanning ? 'cursor-grabbing' : 'cursor-crosshair'"
                class="w-full h-full transition-colors duration-500"
                @mousemove="handleMouseMove"
                @mousedown="handleMouseDown"
                @mouseup="handleMouseUp"
                @mouseleave="handleMouseUp"
                @wheel.prevent="handleWheel"
            >
                <defs>
                    <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" class="text-[var(--separator-secondary)]" stroke-width="0.5" />
                        <circle cx="0" cy="0" r="1.5" fill="currentColor" class="text-[var(--separator-primary)]" />
                    </pattern>
                </defs>
                <rect :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#grid)" />

                <!-- Extrusion Highlights -->
                <g v-for="(ext, idx) in extrusionShapes" :key="`ext-${idx}`">
                    <path 
                        :d="ext.path" 
                        fill="currentColor" 
                        :class="highlightedIdx === idx ? 'text-[var(--accent-primary)] opacity-20' : 'text-[var(--accent-secondary)] opacity-10'"
                        class="transition-opacity duration-300"
                        style="pointer-events: none" 
                    />
                    <path 
                        :d="ext.path" 
                        fill="none" 
                        stroke="currentColor" 
                        :stroke-width="highlightedIdx === idx ? 2 : 0.5"
                        :class="highlightedIdx === idx ? 'text-[var(--accent-primary)]' : 'text-[var(--separator-primary)]'"
                        class="transition-all duration-300"
                        stroke-dasharray="4,4"
                        style="pointer-events: none" 
                    />
                </g>

                <!-- Union Polygon -->
                <path v-if="currentPolygonPath" 
                    :d="currentPolygonPath" 
                    fill="currentColor" 
                    class="text-[var(--background-primary)] opacity-90"
                    stroke="currentColor" 
                    pt:stroke:class="text-[var(--accent-primary)]"
                    stroke-width="2.5" 
                    stroke-linejoin="round"
                />
                <path v-if="currentPolygonPath" 
                    :d="currentPolygonPath" 
                    fill="none" 
                    stroke="currentColor" 
                    class="text-[var(--accent-primary)]"
                    stroke-width="2.5" 
                    stroke-linejoin="round"
                />

                <!-- Interactive Edges -->
                <g v-for="(edge, idx) in currentPolygonEdges" :key="`edge-${idx}`">
                    <line
                        :x1="edge.x1"
                        :y1="edge.y1"
                        :x2="edge.x2"
                        :y2="edge.y2"
                        stroke="transparent"
                        stroke-width="16"
                        stroke-linecap="round"
                        class="cursor-pointer hover:stroke-[var(--accent-primary)]/20"
                        @mouseenter="hoveredEdge = idx"
                        @mouseleave="hoveredEdge = null"
                        @click.stop="showAddFaceDialog(idx, edge)"
                    />
                    <g v-if="hoveredEdge === idx" class="pointer-events-none">
                        <circle :cx="edge.midX" :cy="edge.midY" r="14" fill="currentColor" class="text-[var(--background-primary)]" stroke="currentColor" pt:stroke:class="text-[var(--accent-primary)]" stroke-width="2" />
                        <path d="M-4 0 L4 0 M0 -4 L0 4" :transform="`translate(${edge.midX}, ${edge.midY})`" stroke="currentColor" class="text-[var(--accent-primary)]" stroke-width="2.5" stroke-linecap="round" />
                    </g>
                </g>
            </svg>

            <!-- Floating Type Selector -->
            <div
                v-if="addDialog.visible"
                :style="{ position: 'absolute', left: addDialog.screenX + 'px', top: addDialog.screenY + 'px', transform: 'translate(-50%, -100%)' }"
                class="z-50 mb-6 bg-[var(--background-primary)] shadow-xl rounded-2xl border border-[var(--separator-primary)] p-3 flex flex-col gap-3 min-w-[180px] animate-in fade-in zoom-in slide-in-from-bottom-4 duration-300"
            >
                <div class="flex flex-col gap-1 px-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-[var(--label-tertiary)]">Add Geometry</span>
                    <span class="text-[11px] text-[var(--label-secondary)]">Edge {{ addDialog.edgeIndex }}</span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button @click="confirmAdd('face')" class="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-[var(--accent-primary)] hover:text-[var(--background-primary)] transition-all group">
                        <i class="pi pi-box text-lg"></i>
                        <span class="text-[10px] font-bold uppercase">Face</span>
                    </button>
                    <button @click="confirmAdd('flange')" class="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-[var(--accent-primary)] hover:text-[var(--background-primary)] transition-all group">
                        <i class="pi pi-minus text-lg"></i>
                        <span class="text-[10px] font-bold uppercase">Flange</span>
                    </button>
                </div>
                <Button icon="pi pi-times" text rounded size="small" @click="addDialog.visible = false" class="absolute -top-2 -right-2 bg-[var(--background-primary)] shadow-md h-6 w-6 text-[var(--label-secondary)]" />
            </div>
        </div>
        
        <Toast />
    </div>
</template>

<script setup>
    import { ref, onMounted, reactive, computed } from 'vue'
    import Button from 'primevue/button'
    import InputNumber from 'primevue/inputnumber'
    import Select from 'primevue/select'
    import Toast from 'primevue/toast'
    import ProgressSpinner from 'primevue/progressspinner'
    import { useToast } from 'primevue/usetoast'
    import init, { Modular } from 'nodi-modular'
    import { buildNodiGraph } from '~/utils/cassetteGraphBuilder'

    const toast = useToast()

    // State
    const modular = ref(null)
    const templateGraph = ref(null)
    const cassetteData = reactive({
        params: { 
            A: 600, 
            B: 600 
        },
        extrusions: [],
    })

    // UI State
    const hoveredEdge = ref(null)
    const highlightedIdx = ref(null)
    const addDialog = reactive({
        visible: false,
        screenX: 0,
        screenY: 0,
        edgeIndex: null,
    })

    // Geometry Data
    const currentPolygonPath = ref('')
    const currentPolygonEdges = ref([])
    const extrusionShapes = ref([])

    // Viewport State
    const svgElement = ref(null)
    const viewBox = ref({ x: -1000, y: -1000, width: 2000, height: 2000 })
    const isPanning = ref(false)
    const panStart = ref({ x: 0, y: 0 })

    const availableParams = computed(() => Object.keys(cassetteData.params))

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

        const { graph } = buildNodiGraph(cassetteData, templateGraph.value)
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

            // Largest polygon is the union
            const sorted = [...allCurves].sort((a, b) => b.vertices.length - a.vertices.length)
            const largest = sorted[0]

            currentPolygonPath.value = verticesToSVGPath(largest.vertices)
            currentPolygonEdges.value = extractEdges(largest.vertices)

            // Other 5-vertex curves are individual face/flange rectangles
            extrusionShapes.value = allCurves
                .filter((c) => c !== largest && c.vertices.length === 5)
                .map((c) => ({
                    path: verticesToSVGPath(c.vertices),
                }))
        } catch (e) {
            console.error('Evaluation failed:', e)
        }
    }

    const getParamType = (key) => {
        if (['A', 'B'].includes(key)) return 'Root Dim'
        if (/^[C-Z]$/.test(key)) return 'Face Depth'
        if (/^R\d+$/.test(key)) return 'Flange Depth'
        return 'Custom'
    }

    const highlightExtrusion = (idx) => {
        highlightedIdx.value = idx
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
    }

    const confirmAdd = async (type) => {
        let nextParam = ''
        let defaultValue = 0

        if (type === 'face') {
            // Find next letter from C
            const usedLetters = Object.keys(cassetteData.params).filter(k => /^[C-Z]$/.test(k)).sort()
            const lastLetter = usedLetters.length ? usedLetters[usedLetters.length - 1] : 'B'
            nextParam = String.fromCharCode(lastLetter.charCodeAt(0) + 1)
            defaultValue = 600
        } else {
            // Find next R number
            const usedR = Object.keys(cassetteData.params).filter(k => /^R\d+$/.test(k))
            const lastNum = usedR.length ? Math.max(...usedR.map(k => parseInt(k.substring(1)))) : 0
            nextParam = `R${lastNum + 1}`
            defaultValue = 30
        }

        // Add parameter if not exists
        if (!cassetteData.params[nextParam]) {
            cassetteData.params[nextParam] = defaultValue
        }

        cassetteData.extrusions.push({
            edge: addDialog.edgeIndex,
            param: nextParam,
            type
        })
        
        addDialog.visible = false
        await rebuildAndEvaluate()
    }

    const removeExtrusion = async (idx) => {
        const ext = cassetteData.extrusions[idx]
        cassetteData.extrusions.splice(idx, 1)
        
        // Check if parameter is still used
        const isStillUsed = cassetteData.extrusions.some(e => e.param === ext.param)
        if (!isStillUsed && !['A', 'B'].includes(ext.param)) {
            delete cassetteData.params[ext.param]
        }
        
        await rebuildAndEvaluate()
    }

    const reset = async () => {
        cassetteData.params = { A: 600, B: 600 }
        cassetteData.extrusions = []
        await rebuildAndEvaluate()
    }

    const save = async () => {
        try {
            await $fetch('/api/cassettes', {
                method: 'POST',
                body: {
                    name: 'Parametric Cassette ' + new Date().toLocaleTimeString(),
                    slug: 'cassette-' + Date.now(),
                    data: JSON.parse(JSON.stringify(cassetteData))
                }
            })
            toast.add({ severity: 'success', summary: 'Success', detail: 'Template saved successfully', life: 3000 })
        } catch (e) {
            toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save template', life: 3000 })
        }
    }

    // Viewport Controls
    const zoomIn = () => { viewBox.value.width *= 0.8; viewBox.value.height *= 0.8; }
    const zoomOut = () => { viewBox.value.width *= 1.25; viewBox.value.height *= 1.25; }
    const resetView = () => { viewBox.value = { x: -1000, y: -1000, width: 2000, height: 2000 }; }
    const handleWheel = (e) => { const delta = e.deltaY > 0 ? 1.1 : 0.9; viewBox.value.width *= delta; viewBox.value.height *= delta; }
    const handleMouseDown = (e) => { if (e.button === 0 && e.shiftKey) { isPanning.value = true; panStart.value = { x: e.clientX, y: e.clientY }; e.preventDefault(); } }
    const handleMouseMove = (e) => {
        if (isPanning.value) {
            const dx = (e.clientX - panStart.value.x) * (viewBox.value.width / svgElement.value.clientWidth)
            const dy = (e.clientY - panStart.value.y) * (viewBox.value.height / svgElement.value.clientHeight)
            viewBox.value.x -= dx; viewBox.value.y -= dy;
            panStart.value = { x: e.clientX, y: e.clientY };
        }
    }
    const handleMouseUp = () => (isPanning.value = false)
</script>

<style>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--separator-primary);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--label-tertiary);
}
</style>
