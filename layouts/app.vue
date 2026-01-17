<template>
    <div class="flex flex-col min-h-screen bg-[var(--p-surface-ground)]">
        <Menubar
            :model="[]"
            class="rounded-none border-0 sticky top-0 z-50 px-4 py-2"
        >
            <template #start>
                <NuxtLink
                    to="/projects"
                    class="flex items-center gap-2 no-underline text-[var(--p-primary-color)] text-xl font-bold whitespace-nowrap hover:opacity-80 transition-opacity"
                >
                    <span>CutKit</span>
                </NuxtLink>
                <Divider layout="vertical" class="mx-2" />
                <div
                    v-for="(crumb, index) in breadcrumbs"
                    :key="index"
                    class="flex items-center gap-0"
                >
                    <span v-if="index > 0" class="mx-1 opacity-50">/</span>
                    <NuxtLink
                        :to="crumb.to"
                        class="p-button p-component p-button-text p-button-secondary text-sm font-medium"
                    >
                        {{ crumb.name }}
                    </NuxtLink>
                    <Select
                        v-if="crumb.siblings && crumb.siblings.length > 1"
                        :model-value="crumb.to"
                        :options="crumb.siblings"
                        option-label="name"
                        option-value="id"
                        @change="(e) => router.push(e.value)"
                        pt:root:class="p-button p-component p-button-text p-button-secondary px-0 mr-2 border-none"
                        pt:label:class="hidden"
                        pt:dropdown:class="p-0 m-0"
                    />
                </div>
            </template>

            <template #end>
                <div class="flex items-center gap-2">
                    <Button
                        :icon="themeIcon"
                        @click="toggleTheme"
                        text
                        rounded
                        :aria-label="$t('common.toggleTheme')"
                    />
                </div>
            </template>
        </Menubar>

        <main class="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 lg:p-8">
            <slot />
        </main>

        <ChatSupport v-if="supportDialog" />
        <Button
            icon="pi pi-comment"
            :label="$t('support.button')"
            severity="secondary"
            @click="supportDialog = true"
            v-if="!supportDialog"
            class="fixed bottom-8 right-8 z-[999] shadow-lg"
        />
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Menubar from 'primevue/menubar'
    import Divider from 'primevue/divider'
    import Button from 'primevue/button'
    import Select from 'primevue/select'
    import ChatSupport from '~/components/ChatSupport.vue'
    import { useSupportDialog } from '~/composables/useModalState'
    import { API_ROUTES } from '~/composables/apiRoutes'

    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    const supportDialog = useSupportDialog()

    // --- Theme Switcher ---
    const themeCookie = useCookie('theme-mode')

    const isDarkMode = computed(() => themeCookie.value === 'dark')
    const themeIcon = computed(() => (isDarkMode.value ? 'pi pi-sun' : 'pi pi-moon'))

    const toggleTheme = () => {
        themeCookie.value = isDarkMode.value ? 'light' : 'dark'
    }

    const updateThemeClass = (theme) => {
        if (process.client) {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark-mode')
                document.documentElement.classList.remove('light-mode')
            } else {
                document.documentElement.classList.remove('dark-mode')
                document.documentElement.classList.add('light-mode')
            }
        }
    }

    watch(themeCookie, (newTheme) => {
        updateThemeClass(newTheme)
    })

    onMounted(() => {
        if (!themeCookie.value) {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            themeCookie.value = prefersDark ? 'dark' : 'light'
        }
        updateThemeClass(themeCookie.value)
    })

    // --- Breadcrumb Navigation ---
    const { data: projectsData } = await useAsyncData('projects', () => $fetch(API_ROUTES.PROJECTS))
    const projects = computed(() => projectsData.value?.projects || [])

    // Fetch current project if on project page
    const currentProjectSlug = computed(() => {
        const parts = route.path.split('/').filter((p) => p)
        if (parts[0] === 'project' && parts[1]) {
            return parts[1]
        }
        return null
    })

    const { data: currentProject } = await useAsyncData(
        'currentProject',
        () => (currentProjectSlug.value ? $fetch(`/api/project/${currentProjectSlug.value}`) : null),
        { watch: [currentProjectSlug] },
    )

    const breadcrumbs = computed(() => {
        const parts = route.path.split('/').filter((p) => p)
        const nav = []

        if (parts.length === 0) return nav

        // --- Level 1: Main Section ---
        const mainSections = [
            { id: 'projects', name: t('nav.projects'), to: '/projects' },
            { id: 'assets', name: t('nav.assets'), to: '/assets' },
            { id: 'profile', name: t('nav.profile'), to: '/profile' },
        ]

        let currentSectionId = parts[0]
        if (currentSectionId === 'project') {
            currentSectionId = 'projects'
        }

        const currentSection = mainSections.find((s) => s.id === currentSectionId)

        if (currentSection) {
            nav.push({
                ...currentSection,
                siblings: mainSections.map((s) => ({ ...s, id: s.to })),
            })
        }

        // --- Level 2: Project Details ---
        if (parts[0] === 'project' && parts[1]) {
            const projectName = currentProject.value?.name || parts[1]
            const projectSlug = parts[1]

            nav.push({
                id: projectSlug,
                name: projectName,
                to: `/project/${projectSlug}/batches`,
                siblings:
                    projects.value && Array.isArray(projects.value)
                        ? projects.value.map((p) => ({ name: p.name, id: `/project/${p.slug}/batches` }))
                        : [],
            })
        }

        // --- Level 2: Asset Tabs ---
        if (currentSectionId === 'assets') {
            const assetTabs = [
                { id: 'cassettes', name: t('nav.cassettes'), to: '/assets/cassettes' },
                { id: 'pens', name: t('nav.pens'), to: '/assets/pens' },
                { id: 'tools', name: t('nav.tools'), to: '/assets/tools' },
                { id: 'templates', name: t('nav.templates'), to: '/assets/templates' },
            ]

            const currentAssetTabId = parts[1] || 'cassettes'
            const currentAssetTab = assetTabs.find((t) => t.id === currentAssetTabId)

            if (currentAssetTab) {
                nav.push({
                    ...currentAssetTab,
                    siblings: assetTabs.map((t) => ({ ...t, id: t.to })),
                })
            }
        }

        return nav
    })
</script>

<style scoped lang="scss">
</style>

