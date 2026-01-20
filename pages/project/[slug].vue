<template>
    <div class="flex flex-col gap-6">
        <div v-if="project" class="px-1 flex flex-col gap-1">
            <h1 class="text-2xl font-black text-[var(--p-text-color)] m-0 tracking-tight">{{ project.name }}</h1>
            <div class="flex items-center gap-2 text-[var(--p-text-muted-color)] text-xs font-bold uppercase tracking-widest">
                <i class="pi pi-folder-open text-[10px]"></i>
                <span>{{ slug }}</span>
            </div>
        </div>

        <TabView :activeIndex="activeTabIndex" @tab-change="onTabChange">
            <TabPanel v-for="(tab, index) in tabs" :key="tab.key" :header="tab.label">
            </TabPanel>
        </TabView>
        
        <div class="px-1">
            <NuxtPage />
        </div>
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
        { label: t('project.queues'), to: `/project/${slug}/queues`, key: 'queues' },
        { label: t('project.data'), to: `/project/${slug}/data`, key: 'data' },
    ])

    onMounted(async () => {
        try {
            project.value = await $fetch(`/api/project/${slug}`)
        } catch (error) {
            console.error('Failed to load project:', error)
        }

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
        } else if (route.path.includes('/data')) {
            activeTabIndex.value = 1
        }
    }

    const onTabChange = (event) => {
        const tab = tabs.value[event.index]
        router.push(tab.to)
    }
</script>

<style scoped>
</style>

