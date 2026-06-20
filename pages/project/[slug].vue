<template>
    <NuxtPage v-if="isEntityDetailRoute" />
    <StandardPage v-else-if="project" :class="{ 'h-full min-h-0 gap-0 overflow-hidden': isQueueWorkspaceRoute }">
        <NuxtPage />
    </StandardPage>
</template>

<script setup>
    import { computed, onMounted } from 'vue'
    import { useRoute, useRouter } from 'vue-router'
    import StandardPage from '~/components/shared/StandardPage.vue'
    import { useEntity } from '~/composables/useEntity'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const route = useRoute()
    const router = useRouter()
    const slug = route.params.slug

    const { entity: project, fetch: loadProject } = useEntity('project', slug)
    const isEntityDetailRoute = computed(() =>
        route.path.includes(`/project/${slug}/queue/`) ||
        route.path.includes(`/project/${slug}/sheet-design/`)
    )
    const isQueueWorkspaceRoute = computed(() => route.path.replace(/\/$/, '') === `/project/${slug}/queues`)

    onMounted(async () => {
        try {
            await loadProject()
        } catch (error) {
            if (error?.statusCode === 403 || error?.status === 403) {
                router.replace('/projects')
                return
            }
            throw error
        }

        if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
            router.replace(`/project/${slug}/queues`)
        }
    })
</script>
