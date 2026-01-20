<template>
    <div class="h-full flex overflow-hidden bg-[var(--p-content-background)] text-[var(--p-text-color)]">
        <!-- Left Sidebar: Parameters & History -->
        <div class="w-80 border-r border-[var(--p-content-border-color)] flex flex-col bg-[var(--p-content-background)]">
            <div class="p-4 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)]">
                <Inplace :closable="true" class="w-full">
                    <template #display>
                        <span class="text-sm font-bold truncate block hover:text-[var(--p-primary-color)] transition-colors">{{ cassetteName }}</span>
                    </template>
                    <template #content>
                        <InputText v-model="cassetteName" size="small" class="w-full" autofocus />
                    </template>
                </Inplace>
            </div>
            
            <div class="p-4 border-b border-[var(--p-content-border-color)] font-bold uppercase text-[10px] text-[var(--p-text-muted-color)] tracking-widest flex justify-between items-center bg-[var(--p-content-background)]">
                <span>{{ $t('cassette.parametersTitle') }}</span>
                <Button icon="pi pi-plus" text rounded size="small" @click="showAddParamDialog = true" class="h-6 w-6" />
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar">
                <!-- Global Dimensions -->
                <div class="p-4 flex flex-col gap-4 border-b border-[var(--p-content-border-color)]">
                    <div v-for="(val, key) in cassetteData.params" :key="key" class="flex flex-col gap-1.5">
                        <div class="flex justify-between items-center px-0.5">
                            <label class="text-[11px] font-bold text-[var(--p-text-secondary-color)] uppercase tracking-tighter">{{ key }}</label>
                            <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] text-[var(--p-text-muted-color)]">{{ $t(`cassette.${getParamType(key)}`) }}</span>
                        </div>
                        <InputNumber 
                            v-model="cassetteData.params[key]" 
                            @update:modelValue="rebuildAndEvaluate" 
                            class="w-full" 
                            size="small"
                            showButtons
                            buttonLayout="horizontal"
                            :step="10"
                        />
                    </div>
                </div>

                <!-- Extrusion History -->
                <div class="p-4 border-b border-[var(--p-content-border-color)] font-bold uppercase text-[10px] text-[var(--p-text-muted-color)] tracking-widest">
                    {{ $t('cassette.facesAndFlanges') }}
                </div>
                <div class="p-2 flex flex-col gap-1">
                    <div v-if="cassetteData.extrusions.length === 0" class="text-[11px] text-[var(--p-text-muted-color)] text-center py-12 px-4 italic leading-relaxed opacity-60">
                        {{ $t('cassette.noFaces') }}<br>{{ $t('cassette.clickEdgeToGrow') }}
                    </div>
                    <div v-for="(ext, idx) in cassetteData.extrusions" :key="idx" 
                        class="group p-3 rounded-xl border border-transparent hover:border-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] transition-all flex flex-col gap-3 shadow-sm hover:shadow-md"
                        @mouseenter="highlightExtrusion(idx)"
                        @mouseleave="highlightExtrusion(null)"
                    >
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-black px-2 py-0.5 rounded bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] shadow-sm">{{ ext.param }}</span>
                                <span class="text-[10px] font-bold text-[var(--p-text-muted-color)] uppercase tracking-wider">{{ $t('cassette.edge') }} {{ ext.edge }}</span>
                            </div>
                            <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeExtrusion(idx)" class="opacity-0 group-hover:opacity-100 h-7 w-7 transition-opacity" />
                        </div>
                        <Select 
                            v-model="ext.param" 
                            :options="availableParams" 
                            class="w-full h-8 text-[11px]" 
                            @change="rebuildAndEvaluate"
                        />
                    </div>
                </div>
            </div>

            <!-- Sidebar Footer -->
            <div class="p-4 border-t border-[var(--p-content-border-color)] flex gap-2 bg-[var(--p-content-background)]">
                <Button :label="$t('common.reset')" icon="pi pi-refresh" severity="secondary" outlined class="flex-1 h-10 text-[11px] font-bold uppercase tracking-wider" @click="reset" />
                <Button :label="$t('common.save')" icon="pi pi-save" class="flex-1 h-10 text-[11px] font-bold uppercase tracking-wider" @click="save" />
            </div>
        </div>

        <!-- Main Content: SVG Canvas -->
        <div class="flex-1 relative overflow-hidden bg-[var(--p-content-background)]">
            <div v-if="!isReady" class="absolute inset-0 flex items-center justify-center bg-[var(--p-content-background)]/80 z-20 backdrop-blur-md">
                <div class="flex flex-col items-center gap-4">
                    <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="4" />
                    <span class="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--p-text-muted-color)]">{{ $t('cassette.initializingEngine') }}</span>
                </div>
            </div>

            <!-- Canvas Toolbar -->
            <div class="absolute top-6 right-6 z-10 flex flex-col gap-2">
                <div class="flex flex-col gap-1 bg-[var(--p-content-background)]/60 backdrop-blur-xl p-1 rounded-xl shadow-2xl border border-[var(--p-content-border-color)]">
                    <Button icon="pi pi-plus" @click="zoomInAtCenter" text rounded class="h-9 w-9 text-[var(--p-text-secondary-color)]" />
                    <Button icon="pi pi-minus" @click="zoomOutAtCenter" text rounded class="h-9 w-9 text-[var(--p-text-secondary-color)]" />
                    <Divider class="m-1" />
                    <Button icon="pi pi-expand" @click="resetView" text rounded class="h-9 w-9 text-[var(--p-text-secondary-color)]" />
                </div>
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
                        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" class="text-[var(--p-content-border-color)]" stroke-width="0.5" />
                        <circle cx="0" cy="0" r="1.5" fill="currentColor" class="text-[var(--p-content-border-color)]" />
                    </pattern>
                </defs>
                <rect :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#grid)" />

                <!-- Extrusion Highlights -->
                <g v-for="(ext, idx) in extrusionShapes" :key="`ext-${idx}`">
                    <path 
                        :d="ext.path" 
                        fill="currentColor" 
                        :class="highlightedIdx === idx ? 'text-[var(--p-primary-color)] opacity-20' : 'text-[var(--p-primary-color)] opacity-5'"
                        class="transition-opacity duration-300"
                        style="pointer-events: none" 
                    />
                    <path 
                        :d="ext.path" 
                        fill="none" 
                        stroke="currentColor" 
                        :stroke-width="highlightedIdx === idx ? 2 : 0.5"
                        :class="highlightedIdx === idx ? 'text-[var(--p-primary-color)]' : 'text-[var(--p-content-border-color)]'"
                        class="transition-all duration-300"
                        stroke-dasharray="4,4"
                        style="pointer-events: none" 
                    />
                </g>

                <!-- Union Polygon -->
                <path v-if="currentPolygonPath" 
                    :d="currentPolygonPath" 
                    :style="{ fill: 'var(--p-content-background)', stroke: 'var(--p-primary-color)' }" 
                    class="opacity-90 shadow-2xl"
                    stroke-width="3" 
                    stroke-linejoin="round"
                />
                <path v-if="currentPolygonPath" 
                    :d="currentPolygonPath" 
                    fill="none" 
                    :style="{ stroke: 'var(--p-primary-color)' }" 
                    stroke-width="3" 
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
                        class="cursor-pointer hover:stroke-[var(--p-primary-color)]/10"
                        @mouseenter="hoveredEdge = idx"
                        @mouseleave="hoveredEdge = null"
                        @click.stop="showAddFaceDialog(idx, edge)"
                    />
                    
                    <!-- Dimension Label -->
                    <g :transform="`translate(${edge.midX}, ${edge.midY})`" class="pointer-events-none select-none">
                        <rect 
                            :x="-35" :y="-12" :width="70" :height="24" 
                            rx="12" :style="{ fill: 'var(--p-content-background)', stroke: 'var(--p-content-border-color)' }" stroke-width="1"
                            class="shadow-sm"
                        />
                        <text 
                            text-anchor="middle" dominant-baseline="middle" 
                            class="fill-[var(--p-text-color)] font-black text-[10px] tracking-tighter"
                        >
                            {{ getEdgeAlias(idx) }}
                        </text>
                    </g>
                    
                    <g v-if="hoveredEdge === idx" class="pointer-events-none animate-in fade-in zoom-in duration-200">
                        <circle :cx="edge.midX" :cy="edge.midY" r="16" :style="{ fill: 'var(--p-content-background)', stroke: 'var(--p-primary-color)' }" stroke-width="2" class="shadow-lg" />
                        <path d="M-5 0 L5 0 M0 -5 L0 5" :transform="`translate(${edge.midX}, ${edge.midY})`" :style="{ stroke: 'var(--p-primary-color)' }" stroke-width="3" stroke-linecap="round" />
                    </g>
                </g>
            </svg>

            <!-- Floating Type Selector -->
            <div
                v-if="addDialog.visible"
                :style="{ position: 'absolute', left: addDialog.screenX + 'px', top: addDialog.screenY + 'px', transform: 'translate(-50%, -100%)' }"
                class="z-50 mb-8 bg-[var(--p-content-background)] shadow-2xl rounded-2xl border border-[var(--p-content-border-color)] p-4 flex flex-col gap-4 min-w-[200px] animate-in fade-in zoom-in slide-in-from-bottom-4 duration-300"
            >
                <div class="flex flex-col gap-1 px-1">
                    <span class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('cassette.addGeometry') }}</span>
                    <span class="text-[11px] font-bold text-[var(--p-text-secondary-color)]">{{ $t('cassette.edge') }} {{ addDialog.edgeIndex }}</span>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <button @click="confirmAdd('face')" class="flex flex-col items-center gap-3 p-4 rounded-xl border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] text-[var(--p-text-color)] transition-all group">
                        <i class="pi pi-box text-xl group-hover:scale-110 transition-transform"></i>
                        <span class="text-[10px] font-black uppercase tracking-wider">{{ $t('cassette.face') }}</span>
                    </button>
                    <button @click="confirmAdd('flange')" class="flex flex-col items-center gap-3 p-4 rounded-xl border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)] hover:bg-[var(--p-primary-50)] text-[var(--p-text-color)] transition-all group">
                        <i class="pi pi-minus text-xl group-hover:scale-110 transition-transform"></i>
                        <span class="text-[10px] font-black uppercase tracking-wider">{{ $t('cassette.flange') }}</span>
                    </button>
                </div>
                <Button icon="pi pi-times" text rounded size="small" @click="addDialog.visible = false" class="absolute -top-3 -right-3 bg-[var(--p-content-background)] shadow-lg border border-[var(--p-content-border-color)] h-8 w-8" />
            </div>
        </div>
        
        <Toast />
        
        <!-- Add Parameter Dialog -->
        <Dialog v-model:visible="showAddParamDialog" :header="$t('cassette.addCustomParameter')" modal :style="{ width: '95vw', maxWidth: '350px' }">
            <div class="flex flex-col gap-6 py-4">
                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold text-[var(--p-text-secondary-color)] uppercase tracking-wider">{{ $t('cassette.parameterName') }}</label>
                    <InputText v-model="newParam.name" :placeholder="$t('cassette.parametersPlaceholder')" class="w-full" autofocus />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold text-[var(--p-text-secondary-color)] uppercase tracking-wider">{{ $t('cassette.initialValue') }}</label>
                    <InputNumber v-model="newParam.value" class="w-full" showButtons :min="0" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddParamDialog = false" />
                <Button :label="$t('common.add')" @click="addCustomParam" :disabled="!newParam.name" />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
    import { ref, onMounted, reactive, computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import Button from 'primevue/button'
    import InputNumber from 'primevue/inputnumber'
    import InputText from 'primevue/inputtext'
    import Select from 'primevue/select'
    import Dialog from 'primevue/dialog'
    import Toast from 'primevue/toast'
    import Inplace from 'primevue/inplace'
    import ProgressSpinner from 'primevue/progressspinner'
    import Divider from 'primevue/divider'
    import Tag from 'primevue/tag'
    import { useToast } from 'primevue/usetoast'
    import init, { Modular } from 'nodi-modular'
    import { buildNodiGraph } from '~/server/utils/cassetteGraphBuilder'
    import { useCassettesStore } from '~/stores/cassettes'

    const { t } = useI18n()
    const props = defineProps({
        initialData: {
            type: Object,
            default: null
        }
    })

    const toast = useToast()
    const cassettesStore = useCassettesStore()

    // State
    const isReady = ref(false)
    const templateGraph = ref(null)
    const cassetteName = ref(props.initialData?.name || t('cassette.newCassette'))
    const cassetteData = reactive({
        params: { 
            A: 600, 
            B: 600 
        },
        extrusions: [],
    })

    const showAddParamDialog = ref(false)
    const newParam = reactive({ name: '', value: 100 })

    // Load initial data if provided
    if (props.initialData?.data) {
        Object.assign(cassetteData.params, props.initialData.data.params)
        cassetteData.extrusions = [...props.initialData.data.extrusions]
    }

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
                name: cassetteName.value,
                data: JSON.parse(JSON.stringify(cassetteData))
            }

            if (props.initialData?._id) {
                await cassettesStore.updateCassette(props.initialData._id, body)
            } else {
                await cassettesStore.createCassette(body)
            }
            
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassette.messages.saveSuccess'), life: 3000 })
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

<style>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--p-content-border-color);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--p-primary-color);
}
</style>