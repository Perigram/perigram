<template>
    <div class="flex flex-col gap-8">
        <TraceChain :ancestry="ancestry" />

        <div class="flex justify-between items-center">
            <h1 class="m-0">{{ design.name || 'Nesting Layout' }}</h1>
            <div class="flex gap-2">
                <Button label="Download DXF" icon="pi pi-download" />
                <Button label="Export G-Code" icon="pi pi-file-export" text />
            </div>
        </div>

        <div class="grid-details">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Geometry Viewer -->
                <Card>
                    <template #content>
                        <div class="aspect-[2/1] flex items-center justify-center italic opacity-20">
                            GEOMETRY PREVIEW
                        </div>
                    </template>
                </Card>

                <!-- Stats -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                     <Card>
                        <template #title>{{ design.utilization }}%</template>
                        <template #subtitle>Utilization</template>
                    </Card>
                     <Card>
                        <template #title>{{ design.partsCount }}</template>
                        <template #subtitle>Parts</template>
                    </Card>
                     <Card>
                        <template #title>{{ design.cuttingLength }} m</template>
                        <template #subtitle>Length</template>
                    </Card>
                     <Card>
                        <template #title>{{ design.estimatedTime }} min</template>
                        <template #subtitle>Time</template>
                    </Card>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel header="Instances">
                    <div class="flex flex-col gap-2">
                         <TraceLink v-for="cid in design.instanceIds" :key="cid" type="cassetteInstance" :id="cid" />
                    </div>
                </Panel>
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
import Card from 'primevue/card';
import Panel from 'primevue/panel';

const props = defineProps({
    design: { type: Object, required: true }
});

const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('sheetDesign', props.design));
</script>