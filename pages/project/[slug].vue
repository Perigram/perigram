<template>
    <EntityPage 
        v-if="project" 
        :entity="project" 
        entity-type="project"
        @refresh="loadProject"
    >
        <template #actions>
            <Button 
                v-if="authStore.can('projects', 'edit')"
                :label="$t('common.edit')" 
                icon="pi pi-pencil" 
                outlined 
                @click="showEditDialog = true" 
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
    import Button from 'primevue/button'
    import EntityPage from '~/components/shared/EntityPage.vue'
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

    const { entity: project, loading, error, fetch: loadProject } = useEntity('project', slug)
    const activeTabIndex = ref(0)
    const showEditDialog = ref(false)

    const tabs = computed(() => [
        { label: t('project.queues'), to: `/project/${slug}/queues`, key: 'queues' },
        { label: t('project.data'), to: `/project/${slug}/data`, key: 'data' },
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
        } else if (route.path.includes('/data')) {
            activeTabIndex.value = 1
        }
    }

    const onTabChange = (index) => {
        const tab = tabs.value[index]
        router.push(tab.to)
    }
</script>

<style scoped>
</style>

