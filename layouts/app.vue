<template>
    <div class="flex flex-col min-h-screen bg-[var(--ck-page-background)]">
    <header class="sticky top-0 z-50 border-b border-content-border bg-[var(--ck-chrome-background)] backdrop-blur-md">
            <nav class="max-w-[var(--ck-page-max-width)] mx-auto px-4 h-14 flex items-center justify-between gap-2 ">
                <!-- Left: Logo & Breadcrumbs -->
                <div class="flex items-center h-full min-w-0 flex-1">
                    <NuxtLink
                        to="/"
                        class="flex items-center gap-2 no-underline text-primary text-xl font-bold whitespace-nowrap hover:opacity-80 transition-opacity mr-2 shrink-0"
                    >
                        <span>CutKit</span>
                    </NuxtLink>

                    <!-- <Divider layout="vertical" class="mx-1 hidden sm:block shrink-0" /> -->
                    
                    <div class="flex items-center gap-0 overflow-hidden min-w-0">
                        <div
                            v-for="(crumb, index) in breadcrumbs"
                            :key="index"
                            class="flex items-center gap-0 shrink-0"
                        >
                            <span v-if="index > 0" class="mx-0.5 text-muted opacity-50 shrink-0">/</span>
                            <NuxtLink
                                :to="crumb.to"
                                class="p-button p-component p-button-text p-button-secondary text-xs md:text-sm whitespace-nowrap max-w-[80px] sm:max-w-[120px] md:max-w-none truncate px-1 md:px-2"
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
                                pt:root:class="p-button p-component p-button-text p-button-secondary px-0 mr-1 border-none"
                                pt:label:class="hidden"
                                pt:dropdown:class="p-0 m-0"
                            />
                        </div>
                    </div>
                </div>

                <!-- Right: Theme & User -->
                <div class="flex items-center gap-2 shrink-0">
                    <Button
                        :icon="themeIcon"
                        @click="toggleTheme"
                        text
                        rounded
                        size="small"
                        :aria-label="$t('common.toggleTheme')"
                    />
                    
                    <div class="relative flex items-center" v-if="authStore.userIsSet">
                        <Button 
                            type="button" 
                            @click="toggleUserMenu" 
                            class="p-0.5 rounded-full overflow-hidden border-2 border-transparent transition-colors"
                            text
                        >
                            <Avatar 
                                :label="authStore.userData.name ? authStore.userData.name[0].toUpperCase() : 'U'" 
                                shape="circle" 
                                size="normal" 
                                class="bg-primary text-primary-contrast"
                            />
                        </Button>
                        <Menu ref="userMenu" :model="userMenuItems" :popup="true" />
                    </div>
                </div>
            </nav>
        </header>

        <main class="flex-1 max-w-[var(--ck-page-max-width)] w-full mx-auto p-4 md:p-6 lg:p-8">
            <slot />
        </main>

        <ChatSupport v-if="supportDialog" />
        <Button
            icon="pi pi-comment"
            :label="$t('support.button')"
            severity="secondary"
            @click="supportDialog = true"
            v-if="!supportDialog"
            class="fixed bottom-8 right-8 z-[999] [box-shadow:var(--ck-shadow-overlay)]"
        />
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Divider from 'primevue/divider'
    import Button from 'primevue/button'
    import Select from 'primevue/select'
    import Menu from 'primevue/menu'
    import Avatar from 'primevue/avatar'
    import ChatSupport from '~/components/ChatSupport.vue'
    import { useSupportDialog } from '~/composables/useModalState'
    import { API_ROUTES } from '~/composables/apiRoutes'
    import { useAuthStore } from '~/stores/auth'
    import { useNavigationStore } from '~/stores/navigation'
    import { useGlobalStore } from '~/stores/global'

    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    const supportDialog = useSupportDialog()
    const authStore = useAuthStore()
    const navStore = useNavigationStore()
    const globalStore = useGlobalStore()
    const ssrFetchOptions = process.server ? { headers: useRequestHeaders(['cookie']) } : {}

    // Sync protected project context with SSR cookies when route changes.
    watch([() => route.params.slug, () => authStore.userIsSet], async ([newSlug, isSet]) => {
        if (isSet) {
            await navStore.fetchProjectContext(newSlug, ssrFetchOptions)
        } else {
            navStore.currentProject = null
        }
    }, { immediate: true })

    // Fetch projects list once for breadcrumb siblings
    onMounted(async () => {
        if (authStore.userIsSet && globalStore.projectsList.length === 0) {
            await globalStore.getProjects()
        }
    })

    // --- Breadcrumb Navigation ---
    const breadcrumbs = computed(() => {
        return navStore.resolveBreadcrumbs(route.path)
    })

    // --- User Menu ---
    const userMenu = ref();
    const toggleUserMenu = (event) => {
        userMenu.value.toggle(event);
    };

    const userMenuItems = computed(() => {
        const items = [];

        // 1. Current Organization & Context
        if (authStore.organizationData) {
            items.push({
                label: authStore.organizationData.identity?.name,
                items: [
                    {
                        label: `${t('queue.status')}: ${authStore.organizationData.data?.type}`,
                        icon: 'pi pi-info-circle',
                        disabled: true
                    },
                    {
                        label: `Role: ${authStore.userData.role}`,
                        icon: 'pi pi-shield',
                        disabled: true
                    }
                ]
            });
        }

        // 2. Organization Switcher (if multiple)
        if (authStore.userOrganizations.length > 1) {
            items.push({
                label: t('auth.organization'),
                items: authStore.userOrganizations.map(org => ({
                    label: org.name,
                    icon: org.id === authStore.userData.organizationId?.toString() ? 'pi pi-check text-green-500' : 'pi pi-building',
                    command: async () => {
                        if (org.id !== authStore.userData.organizationId?.toString()) {
                            await authStore.switchOrganization(org.id);
                            router.push('/');
                        }
                    }
                }))
            });
        }

        // 3. User Actions
        items.push({
            label: authStore.userData.name || 'User',
            items: [
                {
                    label: t('nav.profile'),
                    icon: 'pi pi-user',
                    command: () => router.push('/profile')
                },
                {
                    label: t('nav.logout'),
                    icon: 'pi pi-sign-out',
                    command: async () => {
                        await authStore.logout();
                        router.push('/auth/login');
                    }
                }
            ]
        });

        // 4. Admin sections (if SuperAdmin)
        if (authStore.isSuperAdmin) {
            items.push({
                label: t('roles.SuperAdmin'),
                items: [
                    {
                        label: t('admin.workbench.title'),
                        icon: 'pi pi-wrench',
                        command: () => router.push('/admin/workbench')
                    },
                    {
                        label: t('features.users'),
                        icon: 'pi pi-users',
                        command: () => router.push('/admin/users')
                    },
                    {
                        label: t('features.organizations'),
                        icon: 'pi pi-building',
                        command: () => router.push('/admin/organizations')
                    },
                    {
                        label: t('admin.domainBuilder.title'),
                        icon: 'pi pi-sitemap',
                        command: () => router.push('/admin/domain-builder')
                    }
                ]
            });
        }

        return items;
    });

    onMounted(async () => {
        if (!authStore.userIsSet) {
            await authStore.setUser();
        }
    });

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

    onMounted(async () => {
        // Theme initialization
        if (!themeCookie.value) {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            themeCookie.value = prefersDark ? 'dark' : 'light'
        }
        updateThemeClass(themeCookie.value)

        // Auth and data initialization
        if (!authStore.userIsSet) {
            await authStore.setUser();
        }
        if (authStore.userIsSet) {
            if (globalStore.projectsList.length === 0) {
                await globalStore.getProjects()
            }
        }
    })
</script>

<style scoped lang="scss">
html {
    font-size: 14px;
}
</style>
