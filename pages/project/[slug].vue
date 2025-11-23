<template>
    <div class="content">
        <Tabs :tabs="tabs" initial-tab="Files">
            <template #Files>
                <ProjectFiles :projectFiles="projectFiles" @addFiles="addFiles" @deleteFile="deleteFile" class="content__files" />
            </template>
            <template #Tables>
                <ProjectTables :project-slug="slug" />
                <TableEditor />
            </template>
            <template #Batches>
                <BatchManagement :project-slug="slug" />
            </template>
            <template #Nesting>
                <MainSettings />
                <Button 
                    :label="btnLabel" 
                    :disabled="btnIsDisable" 
                    @click="startsNest"
                    class="content__btn" 
                />
                <div v-if="nestRequestError" class="content__error">
                    {{ nestRequestError }}
                </div>
                <div v-if="!sizesIsAvailable && !nestRequestError" class="content__error">
                    {{ $t('nesting.errors.plateTooSmall', { 
                        width: biggestPartSizes.width, 
                        height: biggestPartSizes.height,
                        currentWidth: params.widthPlate,
                        currentHeight: params.heightPlate
                    }) }}
                </div>
                <div v-if="!isNewParams" class="content__text">
                    {{ $t('nesting.errors.noChanges') }}
                </div>
            </template>
            <template #Statistics>
                <ProjectStatistics :statistics="projectStatistics" />
            </template>
        </Tabs>
    </div>
    <InfoAboutNestModal v-model:isModalOpen="infoAboutNestDialog" />
</template>

<script setup async>
import Button from 'primevue/button';
import ProjectStatistics from '~/components/ProjectStatistics.vue';
import ProjectTables from '~/components/ProjectTables.vue';
import TableEditor from '~/components/TableEditor.vue';
import BatchManagement from '~/components/BatchManagement.vue';
import Tabs from '~/components/Tabs.vue';
import { tablesStore } from '~/composables/tables';
import { cassettesStore } from '~/composables/cassettes';

const { t } = useI18n();

const infoAboutNestDialog = useInfoAboutNest();

definePageMeta({
    layout: "auth",
    middleware: "auth",
});

const tabs = [
    { name: 'Files', label: computed(() => t('project.files')) },
    { name: 'Tables', label: computed(() => t('project.tables')) },
    { name: 'Batches', label: computed(() => t('project.batches')) },
    { name: 'Nesting', label: computed(() => t('project.nesting')) },
    { name: 'Statistics', label: computed(() => t('project.statistics')) },
];

const headers = useRequestHeaders(['cookie']);

const { getters } = globalStore;
const resultsList = computed(() => getters.resultsList);
const { getters: filesGetters, actions } = filesStore;
const params = computed(() => filesGetters.params);
const { setProjectFiles, setProjectName, nest } = actions;
const filesCount = computed(() => filesGetters.filesCount);
const projectName = computed(() => filesGetters.projectName);
const isNewParams = computed(() => filesGetters.isNewParams);
const isAllFilesDone = computed(
  () => filesGetters.files.every((file) => file.progress === 100) && filesGetters.files.length > 0
);

const openInfoModal = () => {
    infoAboutNestDialog.value = true;
}

const route = useRoute();
const slug = route.params.slug;

const apiPath = `/api/project/${slug}`;

const { data } = await useFetch(apiPath, {
    headers,
    key: slug,
});

const projectFiles = computed(() => filesGetters.files);
const projectStatistics = computed(() => data.value?.statistics || null);
const nestRequestError = computed(() => filesGetters.nestRequestError);

const biggestPartSizes = computed(() => {
    const files = unref(projectFiles);
    if (!files || files.length === 0) return { width: 0, height: 0 };
    
    const allParts = files.flatMap(file => file.parts || []);
    if (allParts.length === 0) return { width: 0, height: 0 };
    
    const maxWidth = Math.max(...allParts.map(part => Math.max(part.width, part.height)));
    const maxHeight = Math.max(...allParts.map(part => Math.min(part.width, part.height)));

    return {
        width: maxWidth || 0,
        height: maxHeight || 0
    };
})

const currentSizes = computed(() => {
    const { widthPlate, heightPlate } = unref(params);
    const width = Number(widthPlate) || 0;
    const height = Number(heightPlate) || 0;
    return {
        width: Math.max(width, height),
        height: Math.min(width, height)
    };
});


const sizesIsAvailable = computed(() => {
    const { width, height } = unref(currentSizes);
    const { width: partWidth, height: partHeight } = unref(biggestPartSizes);
    return width >= partWidth && height >= partHeight;
});


const { actions: tableActions } = tablesStore;

onMounted(() => {
    if (!filesGetters.projectFiles) {
        setProjectFiles(data.value.files, apiPath);
        setProjectName(data.value.name);
    }
    tableActions.setTables(data.value.tables || []);
    cassettesStore.actions.fetchCassettes();

    if (typeof trackEvent !== 'undefined') {
        trackEvent("page_view", {
            page: "project",
            projectSlug: slug,
        });
    }
});


const btnLabel = computed(() => {
    return t('nesting.nest', { count: unref(filesCount) });
});


const btnIsDisable = computed(() => {
    return Boolean(unref(nestRequestError)) || !unref(isNewParams) || !unref(isAllFilesDone) || !unref(sizesIsAvailable);
});


const addFiles = (files) => {
    actions.addFiles(files, slug)
}

const deleteFile = async (fileSlug) => {
    try {
        await $fetch(`/api/project/${slug}/files/${fileSlug}`, {
            method: 'DELETE'
        });
        // Refresh project data
        const updatedData = await $fetch(apiPath);
        setProjectFiles(updatedData.files, apiPath);
    } catch (error) {
        console.error('Failed to delete file:', error);
    }
}

const startsNest = () => {
    if (btnIsDisable.value) return;
    nest(slug);
}
</script>

<style lang="scss" scoped>
.wrapper {
    &>*:not(:last-child) {
        margin-bottom: 40px;
    }
}

.content {
    text-align: center;

    &__files {
        margin-bottom: 40px;
    }

    &__error {
        margin-top: 16px;
        padding: 12px;
        background-color: var(--error-background);
        border: solid 1px var(--error-border);
        color: var(--label-secondary);
        border-radius: 8px;
    }

    &__text {
        color: var(--label-secondary);
        margin-top: 16px;
    }

    &__btn {
        margin-top: 40px;
        margin-right: auto;
        margin-left: auto;
    }
}
</style>
