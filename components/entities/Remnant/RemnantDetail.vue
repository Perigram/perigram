<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="remnant" />

        <Panel>
            <template #header>
                <div class="flex flex-wrap items-start gap-4 min-w-0">
                    <i class="pi pi-undo rotate-180"></i>
                    <h1 class="m-0 min-w-0">{{ serial }}</h1>
                    <div class="min-w-0">
                        <EntityStatus :entity="remnant" entity-type="remnant" :actions="statusActions" />
                    </div>
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-qrcode" text />
                </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="flex flex-col">
                    <small>{{ $t('results.area') }}</small>
                    <span>{{ formattedArea }}</span>
                </div>
                <div class="flex flex-col">
                    <small>Reusability</small>
                    <div class="flex items-center gap-2">
                        <i :class="remnant.isReusable ? 'pi pi-check-circle' : 'pi pi-times-circle'"></i>
                        <span>{{ remnant.isReusable ? $t('common.reusable') : $t('common.waste') }}</span>
                    </div>
                </div>
                <div class="flex flex-col">
                    <small>{{ $t('results.material') }}</small>
                    <TraceLink v-if="remnant.lineage?.pileId" type="material_pile" :id="remnant.lineage.pileId" />
                    <span v-else>—</span>
                </div>
            </div>
        </Panel>

        <div class="grid-details">
            <div class="lg:col-span-3">
                 <Fieldset :legend="$t('warehouse.recoveredArea')">
                    <div class="aspect-[16/9] border rounded flex items-center justify-center relative overflow-hidden">
                        <div 
                            class="border border-dashed rounded flex items-center justify-center"
                            :style="geometryStyle"
                        >
                             <i class="pi pi-undo text-4xl opacity-10 rotate-180"></i>
                        </div>
                    </div>
                 </Fieldset>
            </div>

            <div class="flex flex-col gap-8">
                <Panel :header="$t('requisition.lifecycleTimeline')">
                    <StatusHistory :entity="remnant" entity-type="remnant" />
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
import TraceLink from '~/components/shared/links/TraceLink.vue';
import { useIdentity, useStatus, useSpecs } from '~/composables/useBlocks';
import { useEntity } from '~/composables/useEntity';

const props = defineProps({
    remnant: {
        type: Object,
        required: true
    }
});

const { t } = useI18n();
const { serial } = useIdentity(props.remnant);
const { state } = useStatus(props.remnant);
const { formattedArea, width, length } = useSpecs(props.remnant);
const { changeStatus } = useEntity('remnant', props.remnant?._id || props.remnant?.id);

const statusActions = computed(() => {
    if (state.value !== 'AVAILABLE') return [];
    return [{ label: t('common.markUsed'), icon: 'pi pi-check-circle', severity: 'success', command: () => changeStatus('USED') }];
});

const geometryStyle = computed(() => {
    const max = 300;
    const w_val = width.value || 500;
    const l_val = length.value || 500;
    const ratio = w_val / l_val;
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
