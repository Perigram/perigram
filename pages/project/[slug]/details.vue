<template>
    <EntityPage
        v-if="project"
        :entity="project"
        entity-type="project"
        @refresh="loadProject"
    >
        <template #info>
            <span v-if="project.identity?.slug">{{ project.identity.slug }}</span>
        </template>
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

        <Panel :header="$t('project.data')">
            <EntitySurfaceContent
                :entity="project"
                entity-type="project"
                surface="detail"
                :display-extensions="appEntityDisplayExtensions"
            />
        </Panel>

        <template #sidebar>
            <Panel :header="$t('project.lifecycle')">
                <StatusHistory :entity="project" entity-type="project" compact />
            </Panel>
        </template>
    </EntityPage>
    <StateBlock v-else state="loading" :message="$t('common.loading')" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import { useAuthStore } from '~/stores/auth';
import { useEntity } from '~/composables/useEntity';
import { appEntityDisplayExtensions } from '~/utils/app-entity-surfaces.js';

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
