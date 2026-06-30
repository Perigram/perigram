<template>
    <div
        :class="[
            'flex flex-col bg-[var(--ck-page-background)]',
            isBoundedWorkspaceRoute ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'
        ]"
    >
    <header class="sticky top-0 z-50 hidden shrink-0 border-b border-content-border bg-[var(--ck-chrome-background)] backdrop-blur-md md:block">
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
                            <Button
                                v-if="crumb.siblings && crumb.siblings.length > 1"
                                icon="pi pi-chevron-down"
                                text
                                severity="secondary"
                                size="small"
                                class="mr-1"
                                :aria-label="crumb.name"
                                @click="openBreadcrumbMenu($event, crumb)"
                            />
                        </div>
                        <Menu ref="breadcrumbMenu" :model="breadcrumbMenuItems" :popup="true" />
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
                    <div v-if="authStore.userIsSet" class="relative flex items-center">
                        <Button
                            icon="pi pi-comments"
                            text
                            rounded
                            size="small"
                            :aria-label="$t('support.openChat')"
                            @click="openSupportDialog"
                        />
                        <Badge
                            v-if="supportChatStore.totalUnread"
                            :value="supportChatStore.totalUnread"
                            severity="danger"
                            size="small"
                            class="absolute -right-1 -top-1"
                        />
                    </div>
                    
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

        <main
            :class="[
                'flex min-h-0 w-full max-w-[var(--ck-page-max-width)] flex-1 flex-col mx-auto',
                isBoundedWorkspaceRoute ? 'overflow-hidden px-3 pt-3 pb-24 md:p-4' : 'px-4 pt-4 pb-24 md:p-6 lg:p-8'
            ]"
        >
            <slot />
        </main>

        <ChatSupport v-if="supportDialog" />
        <nav
            v-if="authStore.userIsSet"
            class="fixed inset-x-0 bottom-0 z-[998] border-t border-content-border bg-[var(--ck-chrome-background)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 [box-shadow:var(--ck-shadow-overlay)] md:hidden"
            :aria-label="$t('nav.home')"
        >
            <div class="mx-auto flex max-w-md items-center justify-around gap-1">
                <Button
                    icon="pi pi-home"
                    text
                    rounded
                    :severity="isRouteActive(homeRoute) ? 'primary' : 'secondary'"
                    :aria-label="$t('nav.home')"
                    @click="navigateMobile(homeRoute)"
                />
                <Button
                    v-for="shortcut in mobileShortcutLinks"
                    :key="shortcut.key"
                    :icon="shortcut.icon"
                    text
                    rounded
                    :severity="isRouteActive(shortcut.to) ? 'primary' : 'secondary'"
                    :aria-label="shortcut.label"
                    @click="navigateMobile(shortcut.to)"
                />
                <Button
                    icon="pi pi-plus"
                    rounded
                    :disabled="!currentGeneratedScreen"
                    :severity="currentGeneratedScreen ? 'primary' : 'secondary'"
                    :aria-label="$t('common.add')"
                    @click="addMobileScreenShortcut"
                />
                <div class="relative flex items-center">
                    <Button
                        icon="pi pi-comments"
                        text
                        rounded
                        :severity="supportDialog ? 'primary' : 'secondary'"
                        :aria-label="$t('support.openChat')"
                        @click="openSupportDialog"
                    />
                    <Badge
                        v-if="supportChatStore.totalUnread"
                        :value="supportChatStore.totalUnread"
                        severity="danger"
                        size="small"
                        class="absolute -right-1 -top-1"
                    />
                </div>
                <Button
                    icon="pi pi-user"
                    text
                    rounded
                    :severity="isRouteActive('/profile') ? 'primary' : 'secondary'"
                    :aria-label="$t('nav.profile')"
                    @click="navigateMobile('/profile')"
                />
            </div>
        </nav>
        <Button
            icon="pi pi-comment"
            severity="secondary"
            rounded
            :aria-label="$t('support.openChat')"
            @click="openSupportDialog"
            v-if="!supportDialog"
            class="fixed bottom-8 right-8 z-[999] hidden [box-shadow:var(--ck-shadow-overlay)] md:inline-flex"
        />
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Button from 'primevue/button'
    import Badge from 'primevue/badge'
    import Menu from 'primevue/menu'
    import Avatar from 'primevue/avatar'
    import ChatSupport from '~/components/ChatSupport.vue'
    import { useSupportDialog } from '~/composables/useModalState'
    import { useAuthStore } from '~/stores/auth'
    import { useSupportChatStore } from '~/stores/supportChat'
    import { useEntityEventsStore } from '~/stores/entityEvents'
    import { useNavigationStore } from '~/stores/navigation'
    import { useGlobalStore } from '~/stores/global'
    import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT } from '~/utils/mobile-transient-surfaces.js'
    import { generatedScreenLabel } from '~/utils/generated-labels.js'

    const router = useRouter()
    const route = useRoute()
    const { t, te } = useI18n()
    const supportDialog = useSupportDialog()
    const authStore = useAuthStore()
    const supportChatStore = useSupportChatStore()
    const entityEventsStore = useEntityEventsStore()
    const navStore = useNavigationStore()
    const globalStore = useGlobalStore()
    const ssrFetchOptions = process.server ? { headers: useRequestHeaders(['cookie']) } : {}
    const mobileShortcuts = ref([])
    const MOBILE_SHORTCUT_LIMIT = 2

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
        loadMobileShortcuts()
        window.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeMobileTransientSurfaces)
    })

    onUnmounted(() => {
        window.removeEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeMobileTransientSurfaces)
    })

    watch(() => authStore.userIsSet, (isSet) => {
        if (isSet) {
            supportChatStore.connect()
            entityEventsStore.connect()
        } else {
            supportChatStore.disconnect()
            entityEventsStore.disconnect()
        }
    }, { immediate: true })

    // --- Breadcrumb Navigation ---
    const breadcrumbs = computed(() => {
        return navStore.resolveBreadcrumbs(route.path, route.query)
    })

    const breadcrumbMenu = ref()
    const breadcrumbMenuItems = ref([])
    const openBreadcrumbMenu = (event, crumb) => {
        breadcrumbMenuItems.value = (crumb.siblings || []).map((sibling) => ({
            label: sibling.name,
            command: () => router.push(sibling.id || sibling.to)
        }))
        breadcrumbMenu.value?.toggle(event)
    }

    const isBoundedWorkspaceRoute = computed(() => /^\/project\/[^/]+\/queues\/?$/.test(route.path))
    const screenName = (screen) => generatedScreenLabel(screen, { t, te })
    const mobileShortcutStorageKey = computed(() => [
        'cutkit.mobileScreenShortcuts.v1',
        authStore.userData?.id || authStore.userData?.userId || 'anonymous',
        authStore.userData?.organizationId || authStore.organizationData?._id || 'organization'
    ].join(':'))
    const homeRoute = computed(() => {
        if (authStore.processActive) {
            const home = authStore.screenManifest.find(screen => screen.template === 'home' && screen.route)
            if (home?.route) return home.route
            const hub = authStore.screenManifest.find(screen => screen.route && screen.template !== 'entityDetail' && (screen.placement || 'hub') === 'hub')
            if (hub?.route) return hub.route
        }
        return '/'
    })
    const currentGeneratedScreen = computed(() => {
        if (!route.path.startsWith('/screens/')) return null
        const key = String(route.params.screenKey || route.path.split('/').filter(Boolean)[1] || '')
        if (!key) return null
        return authStore.screenManifest.find(screen => (
            screen.screenKey === key
            || screen.id === key
            || screen.route === route.path
        )) || null
    })
    const mobileShortcutLinks = computed(() => mobileShortcuts.value
        .map(shortcut => {
            const screen = authStore.screenManifest.find(item => (
                item.screenKey === shortcut.screenKey
                || item.id === shortcut.screenKey
                || item.route === shortcut.to
            ))
            return {
                ...shortcut,
                key: `${shortcut.screenKey}:${shortcut.to}`,
                label: screen ? screenName(screen) : shortcut.label,
                icon: screenIcon(screen || shortcut)
            }
        })
        .filter(shortcut => Boolean(shortcut.to)))

    const closeMobileTransientSurfaces = () => {
        supportDialog.value = false
        breadcrumbMenu.value?.hide?.()
        userMenu.value?.hide?.()
    }

    const requestCloseTransientSurfaces = () => {
        window.dispatchEvent(new CustomEvent(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT))
    }

    const openSupportDialog = () => {
        requestCloseTransientSurfaces()
        supportDialog.value = true
    }

    const navigateMobile = (to) => {
        requestCloseTransientSurfaces()
        router.push(to)
    }

    const isRouteActive = (to) => {
        const target = String(to || '')
        const [path, query] = target.split('?')
        return query ? route.fullPath === target : route.path === path
    }

    const loadMobileShortcuts = () => {
        if (!process.client) return
        try {
            const parsed = JSON.parse(window.localStorage.getItem(mobileShortcutStorageKey.value) || '[]')
            mobileShortcuts.value = Array.isArray(parsed)
                ? parsed.slice(-MOBILE_SHORTCUT_LIMIT).filter(item => item?.to && item?.screenKey)
                : []
        } catch {
            mobileShortcuts.value = []
        }
    }

    const saveMobileShortcuts = () => {
        if (!process.client) return
        window.localStorage.setItem(mobileShortcutStorageKey.value, JSON.stringify(mobileShortcuts.value.slice(-MOBILE_SHORTCUT_LIMIT)))
    }

    const addMobileScreenShortcut = () => {
        const screen = currentGeneratedScreen.value
        if (!screen) return
        const screenKey = screen.screenKey || screen.id || route.params.screenKey
        const next = {
            screenKey,
            to: route.fullPath,
            label: screenName(screen),
            icon: screenIcon(screen)
        }
        mobileShortcuts.value = [
            ...mobileShortcuts.value.filter(item => !(item.screenKey === screenKey && item.to === next.to)),
            next
        ].slice(-MOBILE_SHORTCUT_LIMIT)
        saveMobileShortcuts()
    }

    const screenIcon = (screen = {}) => {
        if (screen.icon) return screen.icon
        if (screen.template === 'home') return 'pi pi-home'
        const entityIcons = {
            project: 'pi pi-folder',
            queue: 'pi pi-list',
            nestingRun: 'pi pi-list-check',
            nesting_run: 'pi pi-list-check',
            sheetDesign: 'pi pi-map',
            sheet_design: 'pi pi-map',
            cassette: 'pi pi-box',
            cassetteDesign: 'pi pi-pencil',
            cassette_design: 'pi pi-pencil',
            cassetteTemplate: 'pi pi-palette',
            cassette_template: 'pi pi-palette',
            cassetteInstance: 'pi pi-box',
            cassette_instance: 'pi pi-box',
            library: 'pi pi-book',
            artifact: 'pi pi-file',
            geometryCapture: 'pi pi-camera',
            geometry_capture: 'pi pi-camera',
            warehouse: 'pi pi-building',
            material: 'pi pi-database',
            materialPile: 'pi pi-box',
            material_pile: 'pi pi-box',
            requisition: 'pi pi-shopping-cart',
            user: 'pi pi-user',
            organization: 'pi pi-building'
        }
        return entityIcons[screen.entityType] || 'pi pi-th-large'
    }

    watch(mobileShortcutStorageKey, loadMobileShortcuts)

    // --- User Menu ---
    const userMenu = ref();
    const toggleUserMenu = (event) => {
        userMenu.value.toggle(event);
    };

    const userMenuItems = computed(() => {
        const items = [];
        const canOpenGeneratedRoute = (route) => !authStore.processActive || navStore.processAllowsRoute(route);

        // 1. Current Organization & Context
        if (authStore.organizationData) {
            const organizationItems = [
                {
                    label: t('organization.workspace'),
                    icon: 'pi pi-building',
                    visible: authStore.hasTenantPermission('organizations', 'read') || authStore.hasTenantPermission('users', 'admin'),
                    command: () => router.push('/organization')
                },
                {
                    label: t('organization.teamManagement'),
                    icon: 'pi pi-users',
                    visible: authStore.hasTenantPermission('users', 'admin'),
                    command: () => router.push('/organization/users')
                },
                {
                    label: t('processDesigner.title'),
                    icon: 'pi pi-sitemap',
                    visible: authStore.hasTenantPermission('organizations', 'admin'),
                    command: () => router.push('/organization/process')
                }
            ].filter(item => item.visible !== false);
            if (organizationItems.length) items.push({
                label: authStore.organizationData.identity?.name || authStore.organizationData.name || t('organization.workspace'),
                items: organizationItems
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
            label: authStore.userData.name || t('common.user'),
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

        // 4. Admin sections
        const adminItems = [];
        if (authStore.hasPermission('workbench', 'admin') && canOpenGeneratedRoute('/admin')) {
            adminItems.push({
                label: t('admin.workbench.title'),
                icon: 'pi pi-wrench',
                command: () => router.push('/admin')
            });
        }
        if (authStore.hasTenantPermission('users', 'admin') && canOpenGeneratedRoute('/admin/users')) {
            adminItems.push({
                label: t('features.users'),
                icon: 'pi pi-users',
                command: () => router.push('/admin/users')
            });
        }
        if (authStore.hasPermission('config_bot', 'admin') && canOpenGeneratedRoute('/admin/config-bot')) {
            adminItems.push({
                label: t('admin.configBot.title'),
                icon: 'pi pi-sparkles',
                command: () => router.push('/admin/config-bot')
            });
        }

        if (adminItems.length > 0) {
            items.push({
                label: t('nav.admin'),
                items: adminItems
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
