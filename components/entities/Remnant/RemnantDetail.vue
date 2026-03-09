<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="remnant" />

        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-undo rotate-180"></i>
                    <h1 class="m-0">{{ serial }}</h1>
                    <EntityStatus :entity="remnant" entity-type="remnant" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-qrcode" text />
                    <Button :label="$t('common.markUsed')" icon="pi pi-check-circle" severity="success" v-if="state === 'AVAILABLE'" />
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
                    <span>{{ remnant.specs?.material }} / {{ remnant.specs?.color }}</span>
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
                    <StatusHistory :entity="remnant" />
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
import { useIdentity, useStatus, useSpecs } from '~/composables/useBlocks';

const props = defineProps({
    remnant: {
        type: Object,
        required: true
    }
});

const { serial } = useIdentity(props.remnant);
const { state } = useStatus(props.remnant);
const { formattedArea, width, length } = useSpecs(props.remnant);

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
