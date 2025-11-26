<template>
    <div class="surface-0">
        <Menubar
            :model="[]"
            class="app-menubar rounded-none border-x-0 border-t-0 border-b border-300 "
        >
            <template #start>
                <NuxtLink to="/projects" class="logo">
                    <span>CutKit</span>
                </NuxtLink>
                <Divider layout="vertical" />
                <div v-for="(crumb, index) in breadcrumbs" :key="index" class="flex items-center gap-2">
                    <span v-if="index > 0">/</span>
                    <NuxtLink :to="crumb.to" class="p-button p-button-text p-button-sm">
                        {{ crumb.name }}
                    </NuxtLink>
                    <Select
                        v-if="crumb.siblings && crumb.siblings.length > 1"
                        :model-value="crumb.id"
                        :options="crumb.siblings"
                        option-label="name"
                        option-value="id"
                        @change="(e) => router.push(e.value)"
                        pt:label:class="hidden"
                        pt:dropdown:class="p-2"
                        class="p-0 bg-transparent"
                    />
                </div>
            </template>

            <template #end>
                <div class="header-end">
                    <Button
                        :icon="themeIcon"
                        @click="toggleTheme"
                        text
                        rounded
                        aria-label="Theme Switcher"
                    />
                </div>
            </template>
        </Menubar>

        <main class="app-main">
            <slot />
        </main>

        <ChatSupport v-if="supportDialog" />
        <Button
            icon="pi pi-comment"
            label="Support"
            severity="secondary"
            @click="supportDialog = true"
            v-if="!supportDialog"
            class="support-button"
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
    const themeCookie = useCookie('theme-mode');

    const isDarkMode = computed(() => themeCookie.value === 'dark');
    const themeIcon = computed(() => (isDarkMode.value ? 'pi pi-sun' : 'pi pi-moon'));

    const toggleTheme = () => {
        themeCookie.value = isDarkMode.value ? 'light' : 'dark';
    };

    const updateThemeClass = (theme) => {
        if (process.client) {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark-mode');
                document.documentElement.classList.remove('light-mode');
            } else {
                document.documentElement.classList.remove('dark-mode');
                document.documentElement.classList.add('light-mode');
            }
        }
    };

    watch(themeCookie, (newTheme) => {
        updateThemeClass(newTheme);
    });

    onMounted(() => {
        if (!themeCookie.value) {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            themeCookie.value = prefersDark ? 'dark' : 'light';
        }
        updateThemeClass(themeCookie.value);
    });

    // --- Breadcrumb Navigation ---
    const { data: projects } = await useAsyncData('projects', () => $fetch(API_ROUTES.PROJECTS));
    
    // Fetch current project if on project page
    const currentProjectSlug = computed(() => {
        const parts = route.path.split('/').filter(p => p);
        if (parts[0] === 'project' && parts[1]) {
            return parts[1];
        }
        return null;
    });
    
    const { data: currentProject } = await useAsyncData(
        'currentProject',
        () => currentProjectSlug.value ? $fetch(`/api/project/${currentProjectSlug.value}`) : null,
        { watch: [currentProjectSlug] }
    );

    const breadcrumbs = computed(() => {
        const parts = route.path.split('/').filter(p => p);
        const nav = [];

        if (parts.length === 0) return nav;

        // --- Level 1: Main Section ---
        const mainSections = [
            { id: 'projects', name: 'Projects', to: '/projects' },
            { id: 'assets', name: 'Assets', to: '/assets' },
            { id: 'profile', name: 'Profile', to: '/profile' },
        ];

        let currentSectionId = parts[0];
        if (currentSectionId === 'project') {
            currentSectionId = 'projects';
        }

        const currentSection = mainSections.find(s => s.id === currentSectionId);

        if (currentSection) {
            nav.push({
                ...currentSection,
                siblings: mainSections.map(s => ({...s, id: s.to})),
            });
        }

        // --- Level 2: Project Details ---
        if (parts[0] === 'project' && parts[1]) {
            const projectName = currentProject.value?.name || parts[1];
            const projectSlug = parts[1];
            
            nav.push({
                id: projectSlug,
                name: projectName,
                to: `/project/${projectSlug}/batches`,
                siblings: projects.value && Array.isArray(projects.value) 
                    ? projects.value.map(p => ({ name: p.name, id: `/project/${p.slug}/batches` }))
                    : []
            });
        }

        // --- Level 2: Asset Tabs ---
        if (currentSectionId === 'assets') {
            const assetTabs = [
                { id: 'assets', name: 'Library', to: '/assets' },
                { id: 'cassettes', name: 'Cassettes', to: '/assets/cassettes' },
                { id: 'parts', name: 'Parts', to: '/assets/parts' },
            ];
            
            const currentAssetTabId = parts[1] || 'assets';
            const currentAssetTab = assetTabs.find(t => t.id === currentAssetTabId);
            
            if (currentAssetTab) {
                nav.push({
                    ...currentAssetTab,
                    siblings: assetTabs.map(t => ({...t, id: t.to})),
                });
            }
        }
        
        return nav;
    });
</script>

<style scoped lang="scss">
    .app-layout {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--surface-ground);
    }

    .app-menubar {
        position: sticky;
        top: 0;
        z-index: 1000;

        :deep(.p-menubar-start) {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        :deep(.p-menubar-end) {
            margin-left: auto;
        }
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        text-decoration: none;
        color: var(--primary-color);
        font-size: 1.25rem;
        font-weight: 700;
        white-space: nowrap;

        i {
            font-size: 1.5rem;
        }

        &:hover {
            opacity: 0.8;
        }
    }

    .header-end {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .app-main {
        flex: 1;
        max-width: 1600px;
        width: 100%;
        margin: 0 auto;
        padding: 1.5rem;
    }

    .support-button {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        z-index: 999;
    }
</style>
