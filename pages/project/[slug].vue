<template>
    <NuxtPage v-if="isEntityDetailRoute" />
    <StandardPage
        v-else-if="project"
        :title="project.identity?.name || project.identity?.slug || $t('nav.projects')"
    >
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

    onMounted(async () => {
        await loadProject()

        if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
            router.replace(`/project/${slug}/queues`)
        }
    })
</script>
