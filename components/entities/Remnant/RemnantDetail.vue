<template>
    <div class="flex flex-col gap-6">
        <LineageBreadcrumbs :entity="remnant" />

        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-undo text-primary rotate-180"></i>
                    <h2 class="text-xl font-bold m-0">{{ serial }}</h2>
                    <EntityStatus :entity="remnant" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-qrcode" severity="secondary" text size="small" v-tooltip.top="$t('common.printTag')" />
                    <Button :label="$t('common.markUsed')" icon="pi pi-check-circle" severity="success" size="small" v-if="state === 'AVAILABLE'" />
                </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="flex flex-col gap-1">
                    <span class="text-[10px] opacity-40 font-bold uppercase tracking-tight">{{ $t('results.area') }}</span>
                    <span class="font-bold text-sm text-primary">{{ formattedArea }}</span>
                </div>
                <div class="flex flex-col gap-1">
                    <span class="text-[10px] opacity-40 font-bold uppercase tracking-tight">Reusability</span>
                    <div class="flex items-center gap-2">
                        <i :class="remnant.isReusable ? 'pi pi-check-circle text-green-500' : 'pi pi-times-circle text-red-500'"></i>
                        <span class="font-bold text-sm">{{ remnant.isReusable ? $t('common.reusable') : $t('common.waste') }}</span>
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <span class="text-[10px] opacity-40 font-bold uppercase tracking-tight">{{ $t('results.material') }}</span>
                    <span class="font-bold text-sm">{{ remnant.specs?.material }} / {{ remnant.specs?.color }}</span>
                </div>
            </div>
        </Panel>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3">
                 <Fieldset :legend="$t('warehouse.recoveredArea')">
                    <div class="aspect-[16/9] bg-surface-900 rounded-xl flex items-center justify-center border border-surface-200 dark:border-surface-800 relative overflow-hidden">
                        <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 20px 20px;"></div>
                        <div 
                            class="border-4 border-primary/20 shadow-[0_0_40px_rgba(var(--p-primary-rgb),0.1)] flex items-center justify-center rotate-3 skew-x-3"
                            :style="geometryStyle"
                        >
                             <i class="pi pi-undo text-4xl text-primary opacity-10 rotate-180"></i>
                        </div>
                    </div>
                 </Fieldset>
            </div>

            <div class="flex flex-col gap-6">
                <Panel :header="$t('requisition.lifecycleTimeline')">
                    <StatusTimeline :entity="remnant" />
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
