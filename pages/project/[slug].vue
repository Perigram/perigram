<template>
    <NuxtPage v-if="isEntityDetailRoute" />
    <StandardPage
        v-else-if="project"
        :title="project.identity?.name || project.identity?.slug || $t('nav.projects')"
    >
        <template #nav>
            <Menubar :model="tabs">
                <template #item="{ item, props }">
                    <NuxtLink
                        v-bind="props.action"
                        :to="item.to"
                        :aria-current="isActiveTab(item) ? 'page' : undefined"
                        :class="{ 'font-semibold': isActiveTab(item) }"
                    >
                        <span>{{ item.label }}</span>
                    </NuxtLink>
                </template>
            </Menubar>
        </template>

        <NuxtPage />
    </StandardPage>
</template>

<script setup>
    import { computed, onMounted } from 'vue'
    import { useRoute, useRouter } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Menubar from 'primevue/menubar'
    import StandardPage from '~/components/shared/StandardPage.vue'
    import { useEntity } from '~/composables/useEntity'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    const slug = route.params.slug

    const { entity: project, fetch: loadProject } = useEntity('project', slug)
    const isEntityDetailRoute = computed(() =>
        route.path.includes(`/project/${slug}/queue/`) ||
        route.path.includes(`/project/${slug}/sheet-design/`)
    )

    const tabs = computed(() => [
        { label: t('project.queues'), to: `/project/${slug}/queues`, key: 'queues' },
        { label: t('sheetDesign.sheetDesigns'), to: `/project/${slug}/sheet-designs`, key: 'sheetDesigns' },
        { label: t('project.data'), to: `/project/${slug}/data`, key: 'data' },
        { label: t('queues.artifacts'), to: `/project/${slug}/artifacts`, key: 'artifacts' },
        { label: t('common.details'), to: `/project/${slug}/details`, key: 'details' },
    ])

    onMounted(async () => {
        await loadProject()

        if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
            router.replace(`/project/${slug}/queues`)
        }
    })

    const isActiveTab = (tab) => route.path === tab.to || route.path.startsWith(`${tab.to}/`)
</script>
