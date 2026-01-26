<template>
    <div class="flex flex-col gap-6">
        <LineageBreadcrumbs :entity="sheet" />

        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-file text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ sheetSerial }}</h2>
                    <EntityStatus :entity="sheet" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-qrcode" severity="secondary" text size="small" v-tooltip.top="'Print QR'" />
                    <Button label="Mark Milled" icon="pi pi-check" severity="success" size="small" v-if="sheetState === 'IN-CUTTING'" />
                </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Visual Swatch -->
                <div class="flex flex-col gap-2">
                    <span class="text-[10px] font-black uppercase opacity-40">Material / Color</span>
                    <div class="flex items-center gap-3 p-3 border border-[var(--p-content-border-color)] rounded-xl">
                        <div 
                            class="w-10 h-10 rounded shadow-inner border border-[var(--p-content-border-color)]"
                            :style="{ backgroundColor: colorHex }"
                        ></div>
                        <div class="flex flex-col">
                            <span class="text-sm font-bold">{{ colorName }}</span>
                            <span class="text-[10px] opacity-60">{{ materialName }}</span>
                        </div>
                    </div>
                </div>

                <!-- Physical Specs -->
                <div class="lg:col-span-3">
                    <MaterialSpecs :specs="sheet.specs" />
                </div>
            </div>
        </Panel>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3">
                 <Fieldset legend="Physical Representation">
                    <div class="aspect-[16/9] bg-[var(--p-surface-900)] rounded-xl flex items-center justify-center border border-[var(--p-content-border-color)] relative overflow-hidden">
                        <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 20px 20px;"></div>
                        <div 
                            class="border-2 border-primary/40 bg-primary/5 rounded shadow-lg flex items-center justify-center flex-col gap-2"
                            :style="geometryStyle"
                        >
                            <span class="text-primary text-[10px] font-bold opacity-30 uppercase">Sheet Surface</span>
                            <span class="text-primary font-black">{{ sheetWidth }}x{{ sheetLength }}</span>
                        </div>
                    </div>
                 </Fieldset>
            </div>

            <div class="flex flex-col gap-6">
                <Panel header="Status Timeline" toggleable>
                    <StatusTimeline :entity="sheet" />
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
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import StatusTimeline from '~/components/shared/status/StatusTimeline.vue';
import LineageBreadcrumbs from '~/components/entities/shared/LineageBreadcrumbs.vue';
import MaterialSpecs from '~/components/shared/MaterialSpecs.vue';
import { useIdentity, useStatus, useSpecs } from '~/composables/useBlocks';

const props = defineProps({
    sheet: {
        type: Object,
        required: true
    }
});

const { serial: sheetSerial } = useIdentity(props.sheet);
const { state: sheetState } = useStatus(props.sheet);
const { width: sheetWidth, length: sheetLength } = useSpecs(props.sheet);

// Since sheets inherit from pile, color/material are in specs or lineage-linked
// In v24, we usually flatten important display specs into the specs block
const colorName = computed(() => props.sheet.specs?.color || 'Unknown');
const materialName = computed(() => props.sheet.specs?.material || 'Unknown');
const colorHex = computed(() => props.sheet.specs?.colorHex || '#ccc');

const geometryStyle = computed(() => {
    const max = 300;
    const width = sheetWidth.value || 2000;
    const length = sheetLength.value || 1000;
    const ratio = width / length;
    let w, h;
    if (ratio > 1) {
        w = max;
        h = max / ratio;
    } else {
        h = max;
        w = max * ratio;
    }
    return {
        width: `${w}px`,
        height: `${h}px`
    };
});
</script>