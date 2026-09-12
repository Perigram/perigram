<template>
    <EntityPage :entity="project" entity-type="project">
        <template #info>
            <small>{{ $t('common.created') }}: {{ project.origin?.timestamp ? new Date(project.origin.timestamp).toLocaleDateString() : '—' }}</small>
        </template>
        <template #actions>
            <Button :label="$t('project.settings')" icon="pi pi-cog" text />
            <Button :label="$t('project.createQueue')" icon="pi pi-plus" @click="$emit('add-queue', project)" />
        </template>

        <template #sidebar>
            <MetricPanel :metrics="overviewMetrics" />
            <Panel :header="$t('project.lifecycle')">
                <StatusHistory :entity="project" entity-type="project" />
            </Panel>
        </template>

        <div class="flex flex-col gap-6">
            <ActionToolbar :title="$t('project.queues')" :level="2" />

            <ResponsiveGrid v-if="queues.length" variant="wide" responsive-context="container">
                <QueueCard
                    v-for="queue in queues"
                    :key="queue._id"
                    :queue="queue"
                    variant="compact"
                    @view="viewQueue"
                />
            </ResponsiveGrid>

            <StateBlock v-else-if="!loading" :message="$t('queue.empty')" icon="pi pi-inbox">
                <template #actions>
                    <Button :label="$t('queue.createFirst')" icon="pi pi-plus" text @click="$emit('add-queue', project)" />
                </template>
            </StateBlock>
        </div>
    </EntityPage>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    project: { type: Object, required: true }
});

defineEmits(['add-queue']);

const { t } = useI18n();
const router = useRouter();
const projectSlug = computed(() => props.project.identity?.slug || '');

const queues = ref([]);
const loading = ref(false);

const overviewMetrics = computed(() => [
    { key: 'area', label: t('project.totalArea'), value: `${props.project.summary?.totalArea || 0} m²` },
    { key: 'queues', label: t('project.queues'), value: queues.value.length }
]);

const loadQueues = async () => {
    if (!props.project?._id) return;
    loading.value = true;
    try {
        queues.value = await $fetch(`/api/project/${projectSlug.value}/queues`);
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
