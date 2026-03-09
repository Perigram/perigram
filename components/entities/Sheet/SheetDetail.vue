<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="sheet" />

        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-file"></i>
                    <h1 class="m-0">{{ sheetSerial }}</h1>
                    <EntityStatus :entity="sheet" :actions="statusActions" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-qrcode" text />
                </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <!-- Visual Swatch -->
                <Card>
                    <template #title><small>Material / Color</small></template>
                    <template #content>
                        <div class="flex items-center gap-4">
                            <div 
                                class="w-12 h-12 border rounded"
                                :style="{ backgroundColor: colorHex }"
                            ></div>
                            <div class="flex flex-col">
                                <span class="text-xl">{{ colorName }}</span>
                                <small>{{ materialName }}</small>
                            </div>
                        </div>
                    </template>
                </Card>

                <!-- Physical Specs -->
                <div class="lg:col-span-3">
                    <MaterialSpecs :specs="sheet.specs" />
                </div>
            </div>
        </Panel>

        <div class="grid-details">
            <div class="lg:col-span-3">
                 <Fieldset legend="Physical Representation">
                    <div class="aspect-[16/9] border rounded flex items-center justify-center relative overflow-hidden">
                        <div 
                            class="border border-dashed rounded flex items-center justify-center flex-col gap-4"
                            :style="geometryStyle"
                        >
                            <small>Surface</small>
                            <span class="text-2xl">{{ sheetWidth }}x{{ sheetLength }}</span>
                        </div>
                    </div>
                 </Fieldset>
            </div>

            <div class="flex flex-col gap-8">
                <Panel header="History">
                    <StatusHistory :entity="sheet" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Button from 'primevue/button';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import MaterialSpecs from '~/components/shared/MaterialSpecs.vue';
import { useIdentity, useStatus, useSpecs } from '~/composables/useBlocks';

const props = defineProps({
    sheet: { type: Object, required: true }
});

const emit = defineEmits(['update-status']);

const { serial: sheetSerial } = useIdentity(props.sheet);
const { state: sheetState } = useStatus(props.sheet);
const { width: sheetWidth, length: sheetLength } = useSpecs(props.sheet);

const statusActions = computed(() => {
    const actions = [];
    if (sheetState.value === 'IN-CUTTING' || sheetState.value === 'in cutting') {
        actions.push({ 
            label: 'Mark Milled', 
            icon: 'pi pi-check', 
            severity: 'success', 
            command: () => emit('update-status', { id: props.sheet._id, status: 'milled' }) 
        });
    }
    return actions;
});

const colorName = computed(() => props.sheet.specs?.color || 'Unknown');
const materialName = computed(() => props.sheet.specs?.material || 'Unknown');
const colorHex = computed(() => props.sheet.specs?.colorHex || '#ccc');

const geometryStyle = computed(() => {
    const max = 400;
    const width = sheetWidth.value || 2000;
    const length = sheetLength.value || 1000;
    const ratio = width / length;
    let w, h;
    if (ratio > 1) {
        w = max; h = max / ratio;
    } else {
        h = max; w = max * ratio;
    }
    return { width: `${w}px`, height: `${h}px` };
});
</script>
