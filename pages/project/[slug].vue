<template>
    <NuxtPage v-if="isEntityDetailRoute" />
    <EntityPage 
        v-else-if="project"
        :entity="project" 
        entity-type="project"
        @refresh="loadProject"
    >
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
        </template>

        <div class="flex flex-col gap-6">
            <Tabs :value="activeTabIndex">
                <TabList>
                    <Tab v-for="(tab, index) in tabs" :key="tab.key" :value="index" @click="onTabChange(index)">
                        {{ tab.label }}
                    </Tab>
                </TabList>
            </Tabs>
            
            <NuxtPage />
        </div>
    </EntityPage>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRoute, useRouter } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Tabs from 'primevue/tabs'
    import TabList from 'primevue/tablist'
    import Tab from 'primevue/tab'
    import EntityPage from '~/components/shared/EntityPage.vue'
    import NameEditPopover from '~/components/shared/NameEditPopover.vue'
    import { useAuthStore } from '~/stores/auth'
    import { useEntity } from '~/composables/useEntity'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const authStore = useAuthStore()
    const slug = route.params.slug

    const { entity: project, fetch: loadProject, update: updateProject } = useEntity('project', slug)
    const activeTabIndex = ref(0)
    const savingProject = ref(false)
    const isEntityDetailRoute = computed(() =>
        route.path.includes(`/project/${slug}/queue/`) ||
        route.path.includes(`/project/${slug}/sheet-design/`)
    )

    const tabs = computed(() => [
        { label: t('project.queues'), to: `/project/${slug}/queues`, key: 'queues' },
        { label: t('sheetDesign.sheetDesigns'), to: `/project/${slug}/sheet-designs`, key: 'sheetDesigns' },
        { label: t('project.data'), to: `/project/${slug}/data`, key: 'data' },
        { label: t('queues.artifacts'), to: `/project/${slug}/artifacts`, key: 'artifacts' },
    ])

    onMounted(async () => {
        await loadProject()
        updateActiveTab()

        if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
            router.replace(`/project/${slug}/queues`)
        }
    })

    watch(
        () => route.path,
        () => {
            updateActiveTab()
        },
    )

    const updateActiveTab = () => {
        if (route.path.includes('/queues')) {
            activeTabIndex.value = 0
        } else if (route.path.includes('/sheet-design')) {
            activeTabIndex.value = 1
        } else if (route.path.includes('/data')) {
            activeTabIndex.value = 2
        } else if (route.path.includes('/artifacts')) {
            activeTabIndex.value = 3
        }
    }

    const onTabChange = (index) => {
        const tab = tabs.value[index]
        router.push(tab.to)
    }

    const saveProject = async (projectName, close) => {
        if (!projectName.trim()) return
        savingProject.value = true
        try {
            await updateProject({ name: projectName.trim() })
            await loadProject()
            close?.()
        } finally {
            savingProject.value = false
        }
    }
</script>
