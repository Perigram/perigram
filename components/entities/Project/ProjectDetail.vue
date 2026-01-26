<template>
    <div class="flex flex-col gap-6">
        <LineageBreadcrumbs :entity="project" />

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-4">
                    <h2 class="text-3xl font-black m-0">{{ projectName }}</h2>
                    <EntityStatus :entity="project" />
                </div>
                <div class="flex items-center gap-4 opacity-70">
                    <div class="flex items-center gap-1">
                        <i class="pi pi-calendar text-xs"></i>
                        <span class="text-xs">Created: {{ new Date(project.createdAt).toLocaleDateString() }}</span>
                    </div>
                </div>
            </div>
            <div class="flex gap-2">
                <Button label="Settings" icon="pi pi-cog" severity="secondary" size="small" text />
                <Button label="New Queue" icon="pi pi-plus" size="small" @click="$emit('add-queue', project)" />
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <!-- Main Content: Queues List -->
            <div class="lg:col-span-3 flex flex-col gap-6">
                <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                    <i class="pi pi-list"></i>
                    Production Queues
                </h3>
                
                <div v-if="queues.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <QueueCard 
                        v-for="queue in queues" 
                        :key="queue._id" 
                        :queue="queue"
                        variant="compact"
                        @view="viewQueue"
                    />
                </div>
                
                <div v-else-if="!loading" class="p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
                    <i class="pi pi-inbox text-4xl"></i>
                    <span class="font-bold">No production queues found</span>
                    <Button label="Create First Queue" icon="pi pi-plus" size="small" text @click="$emit('add-queue', project)" />
                </div>
            </div>

            <!-- Sidebar: Health & Team -->
            <div class="flex flex-col gap-6">
                <Panel header="Project Summary">
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-end">
                                <span class="text-2xl font-black">{{ project.summary?.totalArea || 0 }} m²</span>
                                <span class="text-[10px] font-bold uppercase opacity-60">Total Area</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--p-content-border-color)]">
                            <div class="flex flex-col">
                                <span class="text-lg font-black">{{ queues.length }}</span>
                                <span class="text-[8px] font-bold uppercase opacity-60">Queues</span>
                            </div>
                        </div>
                    </div>
                </Panel>

                <Panel header="Status Timeline">
                    <StatusTimeline :entity="project" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Panel from 'primevue/panel';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import StatusTimeline from '~/components/shared/status/StatusTimeline.vue';
import LineageBreadcrumbs from '~/components/entities/shared/LineageBreadcrumbs.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
    project: {
        type: Object,
        required: true
    }
});

defineEmits(['add-queue']);

const router = useRouter();
const { name: projectName, slug: projectSlug } = useIdentity(props.project);

const queues = ref([]);
const loading = ref(false);

const loadQueues = async () => {
    if (!props.project?._id) return;
    loading.value = true;
    try {
        // V24 standard: fetch by lineage.projectId
        queues.value = await $fetch(`/api/queues?lineage.projectId=${props.project._id}`);
    } catch (e) {
        console.error('Failed to load project queues:', e);
    } finally {
        loading.value = false;
    }
};

const viewQueue = (queue) => {
    router.push(`/project/${projectSlug.value}/queue/${queue._id}`);
};

watch(() => props.project?._id, () => loadQueues());
onMounted(() => loadQueues());
</script>
