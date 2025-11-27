<template>
    <div class="project-workspace">
        <Tabs :value="activeTabIndex" @update:value="onTabChange">
            <TabList>
                <Tab v-for="(tab, index) in tabs" :key="tab.key" :value="index">
                    {{ tab.label }}
                </Tab>
            </TabList>
        </Tabs>
        <NuxtPage />
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRoute, useRouter } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Tabs from 'primevue/tabs'
    import TabList from 'primevue/tablist'
    import Tab from 'primevue/tab'

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

    const onTabChange = (index) => {
        const tab = tabs.value[index]
        router.push(tab.to)
    }
</script>

<style scoped lang="scss">
    .project-workspace {
        width: 100%;
    }
</style>

