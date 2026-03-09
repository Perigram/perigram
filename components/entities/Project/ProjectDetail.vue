<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="project" />

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div class="flex flex-col">
                <div class="flex items-center gap-4">
                    <h1 class="m-0">{{ projectName }}</h1>
                    <EntityStatus :entity="project" entity-type="project" />
                </div>
                <small>Created: {{ new Date(project.createdAt).toLocaleDateString() }}</small>
            </div>
            <div class="flex gap-2">
                <Button label="Settings" icon="pi pi-cog" text />
                <Button label="New Queue" icon="pi pi-plus" @click="$emit('add-queue', project)" />
            </div>
        </div>

        <div class="grid-details">
            <!-- Main Content: Queues List -->
            <div class="lg:col-span-3 flex flex-col gap-8">
                <div class="flex items-center gap-2">
                    <i class="pi pi-list"></i>
                    <h2 class="m-0 text-base">Production Queues</h2>
                </div>
                
                <div v-if="queues.length" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <QueueCard 
                        v-for="queue in queues" 
                        :key="queue._id" 
                        :queue="queue"
                        variant="compact"
                        @view="viewQueue"
                    />
                </div>
                
                <div v-else-if="!loading" class="flex flex-col items-center py-20">
                    <i class="pi pi-inbox text-4xl"></i>
                    <p>No production queues found</p>
                    <Button label="Create First Queue" icon="pi pi-plus" text @click="$emit('add-queue', project)" />
                </div>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel header="Summary">
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-col">
                            <small>Total Area</small>
                            <span class="text-3xl">{{ project.summary?.totalArea || 0 }} m²</span>
                        </div>
                        <Divider />
                        <div class="flex flex-col">
                            <small>Queues</small>
                            <span class="text-xl">{{ queues.length }}</span>
                        </div>
                    </div>
                </Panel>

                <Panel header="Lifecycle">
                    <StatusHistory :entity="project" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Divider from 'primevue/divider';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
    project: { type: Object, required: true }
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