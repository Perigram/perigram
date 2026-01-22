<template>
    <div class="flex flex-col gap-6">
        <TraceChain :ancestry="ancestry" />

        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-undo text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ remnant.remnantId || 'Recovered Area' }}</h2>
                    <Tag :value="remnant.status" severity="info" class="text-xs font-bold" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-qrcode" severity="secondary" text size="small" v-tooltip.top="'Print QR Tag'" />
                    <Button label="Mark Used" icon="pi pi-check-circle" severity="success" size="small" v-if="remnant.status === 'in stock'" />
                </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="flex flex-col gap-1">
                    <span class="text-[10px] opacity-40 font-black uppercase">Source Physical Sheet</span>
                    <TraceLink type="sheet" :id="remnant.sheetId" />
                </div>
                <div class="flex flex-col gap-1">
                    <span class="text-[10px] opacity-40 font-black uppercase">Reusability</span>
                    <div class="flex items-center gap-2">
                        <i :class="remnant.isReusable ? 'pi pi-check-circle text-green-500' : 'pi pi-times-circle text-red-500'"></i>
                        <span class="font-bold text-sm">{{ remnant.isReusable ? 'Reusable' : 'Waste' }}</span>
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <span class="text-[10px] opacity-40 font-black uppercase">Current Location</span>
                    <span class="font-bold text-sm">Main Store / Sector R1</span>
                </div>
            </div>
        </Panel>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3">
                 <Fieldset legend="Recovered Surface (Geometry)">
                    <div class="aspect-[16/9] bg-[var(--p-surface-900)] rounded-xl flex items-center justify-center border border-[var(--p-content-border-color)] relative overflow-hidden">
                        <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 20px 20px;"></div>
                        <div class="w-1/2 h-2/3 border-4 border-primary/20 shadow-[0_0_40px_rgba(var(--p-primary-rgb),0.1)] flex items-center justify-center rotate-3 skew-x-3">
                             <i class="pi pi-undo text-4xl text-primary opacity-10"></i>
                        </div>
                    </div>
                 </Fieldset>
            </div>

            <div class="flex flex-col gap-6">
                <Panel header="Traceability Data">
                    <div class="flex flex-col gap-4 text-xs">
                        <p class="m-0 opacity-70">This remnant was derived from a nesting job during queue processing.</p>
                        <div class="bg-[var(--p-surface-100)] p-3 rounded-lg border border-[var(--p-content-border-color)] flex flex-col gap-2">
                            <span class="font-black opacity-40 uppercase text-[8px]">QR Identification</span>
                            <div class="flex justify-center py-2">
                                <i class="pi pi-qrcode text-5xl opacity-20"></i>
                            </div>
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useEntityStore } from '~/stores/entities';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';

const props = defineProps({
    remnant: {
        type: Object,
        required: true
    }
});

const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('remnant', props.remnant));
</script>