<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="sheet" />

        <Panel>
            <template #header>
                <div class="flex flex-wrap items-start gap-4 min-w-0">
                    <i class="pi pi-file"></i>
                    <h1 class="m-0 min-w-0">{{ sheetSerial }}</h1>
                    <div class="min-w-0">
                        <EntityStatus :entity="sheet" entity-type="sheet" :actions="statusActions" />
                    </div>
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
                    <template #title><small>{{ $t('sheets.materialColor') }}</small></template>
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
                    <SpecsBlock :entity="sheet" />
                </div>
            </div>
        </Panel>

        <div class="grid-details">
            <div class="lg:col-span-3">
                 <Fieldset :legend="$t('sheets.physicalRepresentation')">
                    <div class="aspect-[16/9] border rounded flex items-center justify-center relative overflow-hidden">
                        <div 
                            class="border border-dashed rounded flex items-center justify-center flex-col gap-4"
                            :style="geometryStyle"
                        >
                            <small>{{ $t('sheets.surface') }}</small>
                            <span class="text-2xl">{{ sheetWidth }}x{{ sheetLength }}</span>
                        </div>
                    </div>
                 </Fieldset>
            </div>

            <div class="flex flex-col gap-8">
                <Panel :header="$t('common.history')">
                    <StatusHistory :entity="sheet" entity-type="sheet" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Button from 'primevue/button';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import { useIdentity, useStatus, useSpecs } from '~/composables/useBlocks';

const props = defineProps({
    sheet: { type: Object, required: true }
});

const emit = defineEmits(['update-status']);
const { t } = useI18n();

const { serial: sheetSerial } = useIdentity(props.sheet);
const { state: sheetState } = useStatus(props.sheet);
const { width: sheetWidth, length: sheetLength } = useSpecs(props.sheet);

const statusActions = computed(() => {
    const actions = [];
    if (sheetState.value === 'IN-CUTTING' || sheetState.value === 'in cutting') {
        actions.push({ 
            label: t('sheets.markMilled'),
            icon: 'pi pi-check', 
            severity: 'success', 
            command: () => emit('update-status', { id: props.sheet._id, status: 'milled' }) 
        });
    }
    return actions;
});

const colorName = computed(() => props.sheet.specs?.color || t('common.unknown'));
const materialName = computed(() => props.sheet.specs?.material || t('common.unknown'));
const colorHex = computed(() => props.sheet.specs?.colorHex || 'var(--p-content-border-color)');

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
