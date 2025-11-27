<template>
    <div class="project-workspace">
        <TabView :activeIndex="activeTabIndex" @tab-change="onTabChange">
            <TabPanel v-for="(tab, index) in tabs" :key="tab.key" :header="tab.label">
            </TabPanel>
        </TabView>
        <NuxtPage />
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRoute, useRouter } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import TabView from 'primevue/tabview'
    import TabPanel from 'primevue/tabpanel'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const slug = route.params.slug

    const project = ref(null)
    const activeTabIndex = ref(0)

    const tabs = computed(() => [
        { label: t('project.batches'), to: `/project/${slug}/batches`, key: 'batches' },
        { label: t('project.data'), to: `/project/${slug}/data`, key: 'data' },
    ])

    onMounted(async () => {
        try {
            project.value = await $fetch(`/api/project/${slug}`)
        } catch (error) {
            console.error('Failed to load project:', error)
        }

        updateActiveTab()

        // Redirect to batches if on project root
        if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
            router.replace(`/project/${slug}/batches`)
        }
    })

    watch(
        () => route.path,
        () => {
            updateActiveTab()
        },
    )

    const updateActiveTab = () => {
        if (route.path.includes('/batches')) {
            activeTabIndex.value = 0
        } else if (route.path.includes('/data')) {
            activeTabIndex.value = 1
        }
    }

    const onTabChange = (event) => {
        const tab = tabs.value[event.index]
        router.push(tab.to)
    }
</script>

<style scoped lang="scss">
    .project-workspace {
        width: 100%;
    }
</style>

