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

        <!-- Main Content: Shared Drawing Canvas -->
        <div class="flex-1 relative overflow-hidden">
            <div v-if="!isReady" class="absolute inset-0 flex items-center justify-center z-20">
                <div class="flex flex-col items-center gap-4">
                    <ProgressSpinner />
                    <span>{{ $t('cassette.initializingEngine') }}</span>
                </div>
            </div>

            <DrawingCanvas
                :source="canvasSource"
                source-type="parametric-cassette"
                mode="designer"
                :highlighted-extrusion-index="highlightedIdx"
                @ready="handleCanvasReady"
                @error="handleCanvasError"
                @designer-action="handleDesignerAction"
            />

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
    import { ref, reactive, computed, watch } from 'vue'
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
    import DrawingCanvas from '~/components/shared/DrawingCanvas.vue'

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
    const highlightedIdx = ref(null)
    const addDialog = reactive({
        visible: false,
        screenX: 0,
        screenY: 0,
        edgeIndex: null,
    })

    const availableParams = computed(() => Object.keys(cassetteData.params))
    const canvasSource = computed(() => ({
        params: { ...cassetteData.params },
        extrusions: cassetteData.extrusions.map(ext => ({ ...ext }))
    }))

    watch(canvasSource, () => {
        isReady.value = false
    })

    const rebuildAndEvaluate = async () => {
        isReady.value = false
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

    const handleCanvasReady = () => {
        isReady.value = true
    }

    const handleCanvasError = (error) => {
        isReady.value = true
        console.error('Designer canvas failed:', error)
    }

    const handleDesignerAction = ({ edgeIndex, screenX, screenY }) => {
        addDialog.visible = true
        addDialog.screenX = screenX
        addDialog.screenY = screenY
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

</script>
