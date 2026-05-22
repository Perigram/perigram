<template>
    <div class="h-full flex overflow-hidden">
        <!-- Left Sidebar: Parameters & History -->
        <div class="w-80 flex flex-col">
            <Panel>
                <template #header>
                    <Inplace :closable="true" class="w-full">
                        <template #display>
                            <span class="truncate block">{{ cassetteName }}</span>
                        </template>
                        <template #content>
                            <InputText v-model="cassetteName" size="small" class="w-full" autofocus />
                        </template>
                    </Inplace>
                </template>
                
                <div class="flex flex-col gap-6">
                    <div class="flex justify-between items-center">
                        <small>{{ $t('cassette.parametersTitle') }}</small>
                        <Button icon="pi pi-plus" text rounded @click="showAddParamDialog = true" />
                    </div>
                    
                    <!-- Global Dimensions -->
                    <div class="flex flex-col gap-4">
                        <div v-for="(val, key) in cassetteData.params" :key="key" class="flex flex-col gap-1">
                            <div class="flex justify-between items-center">
                                <label>{{ key }}</label>
                                <Tag :value="$t(`cassette.${getParamType(key)}`)" />
                            </div>
                            <InputNumber 
                                v-model="cassetteData.params[key]" 
                                @update:modelValue="rebuildAndEvaluate" 
                                class="w-full" 
                                size="small"
                                showButtons
                            />
                        </div>
                    </div>
                </div>
            </Panel>

            <Panel class="flex-1 overflow-y-auto">
                <template #header>
                    <span>{{ $t('cassette.facesAndFlanges') }}</span>
                </template>
                <div class="flex flex-col gap-3">
                    <div v-if="cassetteData.extrusions.length === 0" class="py-12 text-center italic">
                        {{ $t('cassette.noFaces') }}<br>{{ $t('cassette.clickEdgeToGrow') }}
                    </div>
                    <Panel v-for="(ext, idx) in cassetteData.extrusions" :key="idx" 
                        @mouseenter="highlightExtrusion(idx)"
                        @mouseleave="highlightExtrusion(null)"
                    >
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-2">
                                    <Tag :value="ext.param" severity="info" />
                                    <small>{{ $t('cassette.edge') }} {{ ext.edge }}</small>
                                </div>
                                <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeExtrusion(idx)" />
                            </div>
                            <Select 
                                v-model="ext.param" 
                                :options="availableParams" 
                                size="small"
                                class="w-full" 
                                @change="rebuildAndEvaluate"
                            />
                        </div>
                    </Panel>
                </div>
            </Panel>

            <!-- Sidebar Footer -->
            <Divider />
            <div class="p-4 flex gap-2">
                <Button :label="$t('common.reset')" icon="pi pi-refresh" severity="secondary" outlined class="flex-1" @click="reset" />
                <Button :label="$t('common.save')" icon="pi pi-save" class="flex-1" @click="save" />
            </div>
        </div>

        <!-- Main Content: SVG Canvas -->
        <div class="flex-1 relative overflow-hidden">
            <div v-if="!isReady" class="absolute inset-0 flex items-center justify-center z-20">
                <div class="flex flex-col items-center gap-4">
                    <ProgressSpinner />
                    <span>{{ $t('cassette.initializingEngine') }}</span>
                </div>
            </div>

            <!-- Canvas Toolbar -->
            <div class="absolute top-6 right-6 z-10 flex flex-col gap-1">
                <Button icon="pi pi-plus" @click="zoomInAtCenter" text rounded />
                <Button icon="pi pi-minus" @click="zoomOutAtCenter" text rounded />
                <Divider />
                <Button icon="pi pi-expand" @click="resetView" text rounded />
            </div>

            <svg
                ref="svgElement"
                :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
                :class="isPanning ? 'cursor-grabbing' : 'cursor-crosshair'"
                class="w-full h-full"
                @mousemove="handleMouseMove"
                @mousedown="handleMouseDown"
                @mouseup="handleMouseUp"
                @mouseleave="handleMouseUp"
                @wheel.prevent="handleWheel"
            >
                <defs>
                    <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" class="opacity-10" />
                    </pattern>
                </defs>
                <rect :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#grid)" />

                <!-- Extrusion Highlights -->
                <g v-for="(ext, idx) in extrusionShapes" :key="`ext-${idx}`">
                    <path 
                        :d="ext.path" 
                        fill="currentColor" 
                        :class="highlightedIdx === idx ? 'opacity-20' : 'opacity-5'"
                        style="pointer-events: none" 
                    />
                </g>

                <!-- Union Polygon -->
                <path v-if="currentPolygonPath" 
                    :d="currentPolygonPath" 
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2" 
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
                        stroke-width="20"
                        stroke-linecap="round"
                        class="cursor-pointer"
                        @mouseenter="hoveredEdge = idx"
                        @mouseleave="hoveredEdge = null"
                        @click.stop="showAddFaceDialog(idx, edge)"
                    />
                    
                    <!-- Dimension Label -->
                    <g :transform="`translate(${edge.midX}, ${edge.midY})`" class="pointer-events-none select-none">
                        <rect 
                            :x="-30" :y="-10" :width="60" :height="20" 
                            rx="10" fill="currentColor" />
                        <text 
                            text-anchor="middle" dominant-baseline="middle" 
                            class="fill-current text-xs"
                        >
                            {{ getEdgeAlias(idx) }}
                        </text>
                    </g>
                </g>
            </svg>

            <!-- Floating Type Selector -->
            <div
                v-if="addDialog.visible"
                :style="{ position: 'absolute', left: addDialog.screenX + 'px', top: addDialog.screenY + 'px', transform: 'translate(-50%, -100%)' }"
                class="z-50 mb-8 border rounded p-4 flex flex-col gap-4 min-w-floating-menu"
            >
                <div class="flex flex-col gap-1">
                    <small>{{ $t('cassette.addGeometry') }}</small>
                    <span class="italic">{{ $t('cassette.edge') }} {{ addDialog.edgeIndex }}</span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <Button @click="confirmAdd('face')" text outlined>
                        <div class="flex flex-col items-center gap-2">
                            <i class="pi pi-box"></i>
                            <span>{{ $t('cassette.face') }}</span>
                        </div>
                    </Button>
                    <Button @click="confirmAdd('flange')" text outlined>
                        <div class="flex flex-col items-center gap-2">
                            <i class="pi pi-minus"></i>
                            <span>{{ $t('cassette.flange') }}</span>
                        </div>
                    </Button>
                </div>
                <Button icon="pi pi-times" text rounded size="small" @click="addDialog.visible = false" class="absolute -top-2 -right-2 border" />
            </div>
        </div>
        
        <Toast />
        
        <!-- Add Parameter Dialog -->
        <StandardDialog v-model:visible="showAddParamDialog" :header="$t('cassette.addCustomParameter')" size="sm">
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('cassette.parameterName') }}</label>
                    <InputText v-model="newParam.name" class="w-full" autofocus />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('cassette.initialValue') }}</label>
                    <InputNumber v-model="newParam.value" class="w-full" showButtons :min="0" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddParamDialog = false" />
                <Button :label="$t('common.add')" @click="addCustomParam" :disabled="!newParam.name" />
            </template>
        </StandardDialog>
    </div>
</template>

<script setup>
    import { ref, onMounted, reactive, computed, watch } from 'vue'
    import { useI18n } from 'vue-i18n'
    import Panel from 'primevue/panel'
    import Button from 'primevue/button'
    import InputNumber from 'primevue/inputnumber'
    import InputText from 'primevue/inputtext'
    import Select from 'primevue/select'
    import Toast from 'primevue/toast'
    import Inplace from 'primevue/inplace'
    import ProgressSpinner from 'primevue/progressspinner'
    import Divider from 'primevue/divider'
    import Tag from 'primevue/tag'
    import { useToast } from 'primevue/usetoast'
    import StandardDialog from '~/components/shared/StandardDialog.vue'

    const { t } = useI18n()
    const props = defineProps({
        initialData: {
            type: Object,
            default: null
        }
    })

    const toast = useToast()
    const emit = defineEmits(['saved'])

    const DEFAULT_CASSETTE_GRAPH = {
        params: { A: 600, B: 600 },
        extrusions: []
    }

    const isDesignerGraph = (value) => {
        return value && typeof value === 'object' && (value.params || value.extrusions)
    }

    const normalizeDesignerGraph = (initialData) => {
        const candidates = [
            initialData?.definition?.data,
            initialData?.definition,
            initialData?.data?.definition,
            initialData?.data
        ]

        const graph = candidates.find(isDesignerGraph) || {}
        const params = graph.params && typeof graph.params === 'object'
            ? graph.params
            : DEFAULT_CASSETTE_GRAPH.params
        const extrusions = Array.isArray(graph.extrusions)
            ? graph.extrusions
            : DEFAULT_CASSETTE_GRAPH.extrusions

        return {
            params: { ...DEFAULT_CASSETTE_GRAPH.params, ...params },
            extrusions: extrusions.map(ext => ({ ...ext }))
        }
    }

    const initialGraph = normalizeDesignerGraph(props.initialData)

    // State
    const isReady = ref(false)
    const cassetteName = ref(props.initialData?.name || t('cassette.newCassette'))
    const cassetteData = reactive({
        params: initialGraph.params,
        extrusions: initialGraph.extrusions,
    })

    const showAddParamDialog = ref(false)
    const newParam = reactive({ name: '', value: 100 })

    const hydrateFromInitialData = (initialData) => {
        const graph = normalizeDesignerGraph(initialData)
        cassetteName.value = initialData?.name || t('cassette.newCassette')
        cassetteData.params = graph.params
        cassetteData.extrusions = graph.extrusions
    }

    watch(() => props.initialData, hydrateFromInitialData)

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
            // This ensures the global engine is initialized
            await (await import('~/utils/cassetteRenderer')).renderCassetteToSVG(cassetteData)
            isReady.value = true
            await rebuildAndEvaluate()
        } catch (error) {
            console.error('Initialization failed:', error)
        }
    })

    const rebuildAndEvaluate = async () => {
        if (!process.client) return

        try {
            const result = await (await import('~/utils/cassetteRenderer')).renderCassetteToSVG(cassetteData)
            if (!result) return

            currentPolygonPath.value = result.path
            currentPolygonEdges.value = extractEdges(result.vertices)
            
            // Map extrusion shapes from the rich result
            extrusionShapes.value = result.allCurves
                .filter(c => c.isExtrusion)
                .map(c => ({ path: c.path }))
        } catch (e) {
            console.error('Designer Rebuild failed:', e)
        }
    }

    const getParamType = (key) => {
        if (['A', 'B'].includes(key)) return 'rootDim'
        if (/^[C-Z]$/.test(key)) return 'faceDepth'
        if (/^R\d+$/.test(key)) return 'flangeDepth'
        return 'custom'
    }

    const highlightExtrusion = (idx) => {
        highlightedIdx.value = idx
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

    const getEdgeAlias = (idx) => {
        const edge = currentPolygonEdges.value[idx];
        if (!edge) return '';
        
        const dx = edge.x2 - edge.x1;
        const dy = edge.y2 - edge.y1;
        const length = Math.round(Math.sqrt(dx*dx + dy*dy));
        
        // Find best matching parameter
        let bestMatch = null;
        let minDiff = 2;
        
        for (const [key, val] of Object.entries(cassetteData.params)) {
            const diff = Math.abs(val - length);
            if (diff < minDiff) {
                minDiff = diff;
                bestMatch = key;
            }
        }
        
        if (bestMatch) return `${bestMatch}: ${length}`;
        return `${length}`;
    }

    const showAddFaceDialog = (edgeIndex, edge) => {
        if (!svgElement.value) return
        const svg = svgElement.value
        const pt = svg.createSVGPoint()
        pt.x = edge.midX
        pt.y = edge.midY
        const screenPt = pt.matrixTransform(svg.getScreenCTM())

        // Adjust positioning to keep within screen
        let x = screenPt.x
        let y = screenPt.y

        const padding = 100
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        if (x < padding) x = padding
        if (x > viewportWidth - padding) x = viewportWidth - padding
        if (y < padding) y = padding
        if (y > viewportHeight - padding) y = viewportHeight - padding

        addDialog.visible = true
        addDialog.screenX = x
        addDialog.screenY = y
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

    const addCustomParam = () => {
        if (newParam.name && !cassetteData.params[newParam.name]) {
            cassetteData.params[newParam.name] = newParam.value
            showAddParamDialog.value = false
            newParam.name = ''
            rebuildAndEvaluate()
        }
    }

    const reset = async () => {
        cassetteData.params = { A: 600, B: 600 }
        cassetteData.extrusions = []
        await rebuildAndEvaluate()
    }

    const save = async () => {
        try {
            const body = {
                entities: props.initialData?._id ? { cassette: props.initialData._id } : {},
                parameters: {
                    name: cassetteName.value,
                    type: 'PARAMETRIC',
                    definition: JSON.parse(JSON.stringify(cassetteData)),
                    parameters: Object.keys(cassetteData.params)
                }
            }

            await $fetch('/api/commands/saveCassetteTemplate/run', { method: 'POST', body })
            
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassette.messages.saveSuccess'), life: 3000 })
            emit('saved')
        } catch (e) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassette.errors.saveFailed'), life: 3000 })
        }
    }

    // Viewport Controls
    const getPointFromEvent = (event) => {
        const svg = svgElement.value
        const pt = svg.createSVGPoint()
        pt.x = event.clientX
        pt.y = event.clientY
        return pt.matrixTransform(svg.getScreenCTM().inverse())
    }

    const handleWheel = (event) => {
        const svg = svgElement.value
        const mousePoint = getPointFromEvent(event)
        
        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9
        
        const newWidth = viewBox.value.width * zoomFactor
        const newHeight = viewBox.value.height * zoomFactor
        
        // Calculate new X and Y to zoom into mouse point
        const dx = (mousePoint.x - viewBox.value.x) * (zoomFactor - 1)
        const dy = (mousePoint.y - viewBox.value.y) * (zoomFactor - 1)
        
        viewBox.value = {
            x: viewBox.value.x - dx,
            y: viewBox.value.y - dy,
            width: newWidth,
            height: newHeight
        }
    }

    const zoomInAtCenter = () => {
        const zoomFactor = 0.8
        const newWidth = viewBox.value.width * zoomFactor
        const newHeight = viewBox.value.height * zoomFactor
        const dx = (viewBox.value.width - newWidth) / 2
        const dy = (viewBox.value.height - newHeight) / 2
        viewBox.value = { x: viewBox.value.x + dx, y: viewBox.value.y + dy, width: newWidth, height: newHeight }
    }

    const zoomOutAtCenter = () => {
        const zoomFactor = 1.25
        const newWidth = viewBox.value.width * zoomFactor
        const newHeight = viewBox.value.height * zoomFactor
        const dx = (viewBox.value.width - newWidth) / 2
        const dy = (viewBox.value.height - newHeight) / 2
        viewBox.value = { x: viewBox.value.x + dx, y: viewBox.value.y + dy, width: newWidth, height: newHeight }
    }

    const resetView = () => {
        viewBox.value = { x: -1000, y: -1000, width: 2000, height: 2000 };
    }

    const handleMouseDown = (event) => {
        if (event.button === 0 && event.shiftKey) {
            isPanning.value = true
            panStart.value = { x: event.clientX, y: event.clientY }
            event.preventDefault()
        }
    }

    const handleMouseMove = (event) => {
        if (isPanning.value) {
            const dx = (event.clientX - panStart.value.x) * (viewBox.value.width / svgElement.value.clientWidth)
            const dy = (event.clientY - panStart.value.y) * (viewBox.value.height / svgElement.value.clientHeight)
            viewBox.value.x -= dx; viewBox.value.y -= dy;
            panStart.value = { x: event.clientX, y: event.clientY };
        }
    }

    const handleMouseUp = () => (isPanning.value = false)
</script>
