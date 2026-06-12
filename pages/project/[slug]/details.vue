<template>
    <div v-if="project" class="flex flex-col gap-6">
        <ActionToolbar :title="$t('common.details')" :subtitle="project.identity?.slug">
            <template #actions>
                <NameEditPopover
                    v-if="authStore.can('projects', 'edit')"
                    :model-value="project.identity?.name || ''"
                    :label="$t('project.name')"
                    :placeholder="$t('projects.enterName')"
                    :saving="savingProject"
                    :aria-label="$t('project.rename')"
                    @save="saveProject"
                />
                <Button icon="pi pi-refresh" text rounded :aria-label="$t('common.update')" @click="loadProject" />
            </template>
        </ActionToolbar>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <Panel :header="$t('project.data')">
                <DataBlock entity-type="project" :entity="project" :fields="PROJECT_DETAIL_FIELDS" />
            </Panel>

            <Panel :header="$t('status.status')">
                <div class="flex flex-col gap-4">
                    <EntityStatus :entity="project" entity-type="project" variant="inline" :show-history="false" />
                    <StatusHistory :entity="project" entity-type="project" compact />
                </div>
            </Panel>
        </div>
    </div>
    <StateBlock v-else state="loading" :message="$t('common.loading')" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import { useAuthStore } from '~/stores/auth';
import { useEntity } from '~/composables/useEntity';

const PROJECT_DETAIL_FIELDS = [
    { path: 'data.address', i18n: 'project.address' },
    { path: 'summary.queueCount', i18n: 'project.queues' },
    { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²' },
    { path: 'origin.timestamp', i18n: 'common.created' },
    { path: 'updatedAt', i18n: 'common.lastUpdated' }
];

const route = useRoute();
const authStore = useAuthStore();
const savingProject = ref(false);
const { entity: project, fetch: loadProject, update: updateProject } = useEntity('project', route.params.slug);

onMounted(loadProject);

const saveProject = async (projectName, close) => {
    if (!projectName.trim()) return;
    savingProject.value = true;
    try {
        await updateProject({ name: projectName.trim() });
        await loadProject();
        close?.();
    } finally {
        savingProject.value = false;
    }
};
</script>
