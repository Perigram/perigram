<template>
    <div class="flex flex-col gap-6">
        <TraceChain :ancestry="ancestry" />

        <div class="flex justify-between items-center">
            <h2 class="text-3xl font-black m-0">{{ design.name || 'Nesting Layout' }}</h2>
            <div class="flex gap-2">
                <Button label="Download DXF" icon="pi pi-download" />
                <Button label="Export G-Code" icon="pi pi-file-export" severity="secondary" />
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Large DXF/SVG Viewer -->
                <div class="aspect-[2/1] bg-[var(--p-surface-900)] rounded-2xl border-4 border-[var(--p-surface-800)] flex items-center justify-center relative overflow-hidden">
                     <div class="absolute inset-0 opacity-5" style="background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px); background-size: 50px 50px;"></div>
                     <div class="text-white/10 font-black text-6xl italic select-none">GEOMETRY PREVIEW</div>
                </div>

                <!-- Nesting Results -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div class="p-4 bg-[var(--p-content-background)] rounded-xl border">
                        <span class="text-[10px] font-black uppercase opacity-40 block mb-1">Sheet Utilization</span>
                        <span class="text-xl font-black text-green-600">{{ design.utilization }}%</span>
                    </div>
                     <div class="p-4 bg-[var(--p-content-background)] rounded-xl border">
                        <span class="text-[10px] font-black uppercase opacity-40 block mb-1">Parts Count</span>
                        <span class="text-xl font-black">{{ design.partsCount }}</span>
                    </div>
                     <div class="p-4 bg-[var(--p-content-background)] rounded-xl border">
                        <span class="text-[10px] font-black uppercase opacity-40 block mb-1">Cutting Length</span>
                        <span class="text-sm font-bold">{{ design.cuttingLength }} m</span>
                    </div>
                     <div class="p-4 bg-[var(--p-content-background)] rounded-xl border">
                        <span class="text-[10px] font-black uppercase opacity-40 block mb-1">Estimated Time</span>
                        <span class="text-sm font-bold">{{ design.estimatedTime }} min</span>
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-6">
                <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                    <i class="pi pi-list"></i>
                    Contained Instances
                </h3>
                <div class="flex flex-col gap-2">
                     <TraceLink v-for="cid in design.instanceIds" :key="cid" type="cassetteInstance" :id="cid" />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useEntityStore } from '~/stores/entities';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import Button from 'primevue/button';

const props = defineProps({
    design: {
        type: Object,
        required: true
    }
});

const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('sheetDesign', props.design));
</script>
