<template>
    <div
        :class="[
            'flex flex-col bg-page',
            isBoundedWorkspaceRoute ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'
        ]"
    >
    <header class="chrome-signal-rule sticky top-0 z-50 hidden shrink-0 border-b [border-color:var(--ck-chrome-border)] bg-chrome text-[var(--ck-chrome-foreground)] backdrop-blur-md md:block">
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
                            <span v-if="index > 0" class="mx-0.5 shrink-0 text-[var(--ck-chrome-muted)] opacity-50">/</span>
                            <NuxtLink
                                :to="crumb.to"
                                class="p-button p-component p-button-text p-button-secondary !text-[var(--ck-chrome-foreground)] text-xs md:text-sm whitespace-nowrap max-w-[80px] sm:max-w-[120px] md:max-w-none truncate px-1 md:px-2"
                            >
                                {{ crumb.name }}
                            </NuxtLink>
                            <Button
                                v-if="breadcrumbAlternatives(crumb).length"
                                icon="pi pi-chevron-down"
                                text
                                severity="secondary"
                                size="small"
                                class="mr-1 !text-[var(--ck-chrome-foreground)]"
                                :aria-label="crumb.name"
                                @click="openBreadcrumbMenu($event, crumb)"
                            />
                        </div>
                        <Menu ref="breadcrumbMenu" :model="breadcrumbMenuItems" :popup="true" />
                    </div>
                </div>

                <!-- Right: Chat & User -->
                <div class="flex items-center gap-2 shrink-0">
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
                    </div>
                </div>
            </nav>
        </header>

        <main
            :class="[
                'flex min-h-0 w-full flex-1 flex-col mx-auto',
                isStandaloneDesignerRoute ? 'max-w-none overflow-hidden p-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'
                    : isFlushMobileSurface ? 'max-w-none overflow-hidden p-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:max-w-[var(--ck-page-max-width)] md:overflow-visible md:p-6 lg:p-8'
                    : isGeneratedWorkspaceRoute ? 'max-w-none overflow-hidden p-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'
                        : isBoundedWorkspaceRoute ? 'max-w-[var(--ck-page-max-width)] overflow-hidden px-3 pt-3 pb-24 md:p-4'
                        : 'max-w-[var(--ck-page-max-width)] px-4 pt-4 pb-24 md:p-6 lg:p-8'
            ]"
        >
            <ChatSupport v-if="mobileActiveTab === 'chats'" embedded />
            <slot v-else />
        </main>

        <ChatSupport v-if="supportDialog && mobileActiveTab !== 'chats'" />
        <Menu ref="userMenu" :model="userMenuItems" :popup="true" />
        <Menu ref="mobileScreenMenu" :model="mobileScreenMenuItems" :popup="true" />
        <nav
            v-if="authStore.userIsSet"
            class="chrome-signal-rule fixed inset-x-0 bottom-0 z-[998] border-t [border-color:var(--ck-chrome-border)] bg-chrome px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 [box-shadow:var(--ck-shadow-overlay)] md:hidden"
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
                <div
                    v-for="shortcut in mobileShortcutLinks"
                    :key="shortcut.key"
                    class="relative flex items-center"
                    @pointerdown="startShortcutHold($event, shortcut.index)"
                    @pointerup="clearShortcutHold"
                    @pointerleave="clearShortcutHold"
                    @pointercancel="clearShortcutHold"
                    @contextmenu.prevent="openReplaceShortcutMenu($event, shortcut.index)"
                >
                    <Button
                        :icon="shortcut.icon"
                        text
                        rounded
                        :severity="isRouteActive(shortcut.to) ? 'primary' : 'secondary'"
                        :aria-label="shortcut.label"
                        @click="handleShortcutClick(shortcut)"
                    />
                </div>
                <Button
                    v-if="mobileShortcutLinks.length < MOBILE_SHORTCUT_LIMIT"
                    icon="pi pi-plus"
                    rounded
                    :disabled="!mobileScreenMenuItems.length"
                    :severity="mobileScreenMenuItems.length ? 'primary' : 'secondary'"
                    :aria-label="$t('common.add')"
                    @click="openMobileScreenMenu"
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
                    severity="secondary"
                    :aria-label="$t('nav.profile')"
                    @click="toggleUserMenu"
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
    import { ref, computed, provide, watch, onMounted, onUnmounted } from 'vue'
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
    import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js'

    const router = useRouter()
    const route = useRoute()
    const { t, te } = useI18n()
    const supportDialog = useSupportDialog()
    const authStore = useAuthStore()
    provide('statusWorkflows', computed(() => authStore.statusWorkflows))
    const supportChatStore = useSupportChatStore()
    const entityEventsStore = useEntityEventsStore()
    const navStore = useNavigationStore()
    const globalStore = useGlobalStore()
    const ssrFetchOptions = process.server ? { headers: useRequestHeaders(['cookie']) } : {}
    const mobileShortcuts = ref([])
    const mobileActiveTab = ref('content')
    const mobileShortcutReplaceIndex = ref(null)
    const mobileShortcutHoldTriggered = ref(false)
    const mobileShortcutHoldTimer = ref(null)
    const MOBILE_SHORTCUT_LIMIT = 2

    // Sync protected project context with SSR cookies when route changes.
    watch([() => route.params.slug, () => authStore.userIsSet], async ([newSlug, isSet]) => {
        if (isSet) {
            await navStore.fetchProjectContext(newSlug, ssrFetchOptions)
        } else {
            navStore.currentProject = null
        }
    }, { immediate: true })

    watch([() => route.fullPath, () => authStore.userIsSet], async ([, isSet]) => {
        if (isSet) await navStore.fetchRouteHierarchy(route.path, route.query, ssrFetchOptions)
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
        clearShortcutHold()
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

    watch(supportDialog, (isOpen) => {
        if (isOpen && isMobileViewport()) {
            mobileActiveTab.value = 'chats'
        }
    })

    // --- Breadcrumb Navigation ---
    const breadcrumbs = computed(() => {
        return navStore.resolveBreadcrumbs(route.path, route.query)
    })

    const breadcrumbMenu = ref()
    const breadcrumbMenuItems = ref([])
    const openBreadcrumbMenu = (event, crumb) => {
        breadcrumbMenuItems.value = breadcrumbAlternatives(crumb).map((sibling) => ({
            label: sibling.name,
            command: () => router.push(sibling.id || sibling.to)
        }))
        breadcrumbMenu.value?.toggle(event)
    }
    const breadcrumbAlternatives = (crumb = {}) => (crumb.siblings || [])
        .filter(sibling => (sibling.id || sibling.to) && (sibling.id || sibling.to) !== crumb.to)

    const activeGeneratedScreen = computed(() => {
        if (!route.path.startsWith('/screens/')) return null
        const rawKey = route.params.screenKey
        const screenKey = Array.isArray(rawKey) ? rawKey.join('/') : rawKey
        return authStore.screenManifest.find(screen => (
            screen.screenKey === screenKey || screen.id === screenKey
        )) || null
    })
    const isGeneratedWorkspaceRoute = computed(() => Boolean(
        resolveGeneratedScreenOverload(activeGeneratedScreen.value)
    ))
    const isStandaloneDesignerRoute = computed(() => route.path === '/organization/process')
    const isBoundedWorkspaceRoute = computed(() => (
        isGeneratedWorkspaceRoute.value
        || isStandaloneDesignerRoute.value
        || /^\/project\/[^/]+\/queues\/?$/.test(route.path)
    ))
    const isAccountRoute = computed(() => route.path === '/profile' || route.path.startsWith('/organization'))
    const isFlushMobileSurface = computed(() => mobileActiveTab.value === 'chats' || isAccountRoute.value)
    const screenName = (screen) => generatedScreenLabel(screen, { t, te })
    const mobileShortcutStorageKey = computed(() => [
        'cutkit.mobileScreenShortcuts.v1',
        authStore.userData?.id || authStore.userData?.userId || 'anonymous',
        authStore.userData?.organizationId || authStore.organizationData?._id || 'organization'
    ].join(':'))
    const processOperationalScreens = computed(() => authStore.screenManifest
        .filter(screen => screen.kind !== 'system')
        .filter(screen => typeof screen.route === 'string' && screen.route.startsWith('/screens/')))
    const homeRoute = computed(() => {
        if (authStore.processActive) {
            const home = processOperationalScreens.value.find(screen => screen.template === 'home' && screen.route)
            if (home?.route) return home.route
            const hub = processOperationalScreens.value.find(screen => screen.route && screen.template !== 'entityDetail' && (screen.placement || 'hub') === 'hub')
            if (hub?.route) return hub.route
            return '/screens'
        }
        return '/'
    })
    const availableMobileGeneratedScreens = computed(() => processOperationalScreens.value
        .filter(screen => screen.route && screen.template !== 'home')
        .filter(screen => screen.template !== 'entityDetail')
        .map(screen => ({
            screenKey: screen.screenKey || screen.id || screen.route,
            to: screen.route,
            label: screenName(screen),
            icon: screenIcon(screen)
        })))
    const mobileScreenMenuItems = computed(() => availableMobileGeneratedScreens.value.map(screen => ({
        label: screen.label,
        icon: screen.icon,
        command: () => addMobileScreenShortcut(screen)
    })).concat(Number.isInteger(mobileShortcutReplaceIndex.value)
        ? [{
            separator: true
        }, {
            label: t('common.delete'),
            icon: 'pi pi-trash',
            command: deleteMobileScreenShortcut
        }]
        : []))
    const mobileShortcutLinks = computed(() => mobileShortcuts.value
        .map((shortcut, index) => {
            const screen = authStore.screenManifest.find(item => (
                item.screenKey === shortcut.screenKey
                || item.id === shortcut.screenKey
                || item.route === shortcut.to
            ))
            return {
                ...shortcut,
                index,
                key: `${shortcut.screenKey}:${shortcut.to}`,
                label: screen ? screenName(screen) : shortcut.label,
                icon: screenIcon(screen || shortcut)
            }
        })
        .filter(shortcut => Boolean(shortcut.to)))

    const closeMobileTransientSurfaces = () => {
        supportDialog.value = false
        mobileActiveTab.value = 'content'
        breadcrumbMenu.value?.hide?.()
        userMenu.value?.hide?.()
        mobileScreenMenu.value?.hide?.()
    }

    const requestCloseTransientSurfaces = () => {
        window.dispatchEvent(new CustomEvent(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT))
    }

    const openSupportDialog = () => {
        requestCloseTransientSurfaces()
        if (isMobileViewport()) mobileActiveTab.value = 'chats'
        supportDialog.value = true
    }

    const navigateMobile = (to) => {
        mobileActiveTab.value = 'content'
        requestCloseTransientSurfaces()
        router.push(to)
    }

    const handleShortcutClick = (shortcut) => {
        if (mobileShortcutHoldTriggered.value) {
            mobileShortcutHoldTriggered.value = false
            return
        }
        navigateMobile(shortcut.to)
    }

    const isMobileViewport = () => process.client
        && window.matchMedia?.('(max-width: 767px)')?.matches

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

    const openMobileScreenMenu = (event) => {
        mobileShortcutReplaceIndex.value = null
        mobileScreenMenu.value?.toggle(event)
    }

    const openReplaceShortcutMenu = (event, index) => {
        mobileShortcutReplaceIndex.value = index
        mobileScreenMenu.value?.show?.(event)
    }

    const startShortcutHold = (event, index) => {
        clearShortcutHold()
        mobileShortcutHoldTriggered.value = false
        const anchor = event.currentTarget
        mobileShortcutHoldTimer.value = window.setTimeout(() => {
            mobileShortcutHoldTriggered.value = true
            openReplaceShortcutMenu({ currentTarget: anchor, target: anchor }, index)
        }, 550)
    }

    const clearShortcutHold = () => {
        if (mobileShortcutHoldTimer.value) {
            clearTimeout(mobileShortcutHoldTimer.value)
            mobileShortcutHoldTimer.value = null
        }
    }

    const addMobileScreenShortcut = (screen) => {
        if (!screen) return
        const next = {
            screenKey: screen.screenKey,
            to: screen.to,
            label: screen.label,
            icon: screen.icon
        }
        const replaceIndex = mobileShortcutReplaceIndex.value
        if (Number.isInteger(replaceIndex)) {
            const items = mobileShortcuts.value
                .slice(0, MOBILE_SHORTCUT_LIMIT)
                .filter((item, index) => index !== replaceIndex && !(item.screenKey === next.screenKey && item.to === next.to))
            items.splice(Math.min(replaceIndex, items.length), 0, next)
            mobileShortcuts.value = items.slice(0, MOBILE_SHORTCUT_LIMIT)
        } else {
            mobileShortcuts.value = [
                ...mobileShortcuts.value.filter(item => !(item.screenKey === next.screenKey && item.to === next.to)),
                next
            ].slice(-MOBILE_SHORTCUT_LIMIT)
        }
        mobileShortcutReplaceIndex.value = null
        saveMobileShortcuts()
    }

    const deleteMobileScreenShortcut = () => {
        const removeIndex = mobileShortcutReplaceIndex.value
        if (!Number.isInteger(removeIndex)) return
        mobileShortcuts.value = mobileShortcuts.value.filter((_, index) => index !== removeIndex)
        mobileShortcutReplaceIndex.value = null
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
    const mobileScreenMenu = ref();
    const toggleUserMenu = (event) => {
        userMenu.value.toggle(event);
    };
    const organizationSystemScreens = computed(() => authStore.screenManifest
        .filter(screen => screen.kind === 'system' && typeof screen.route === 'string' && screen.route.startsWith('/organization'))
        .sort((left, right) => organizationScreenOrder(left) - organizationScreenOrder(right)))
    const organizationScreenOrder = (screen = {}) => {
        const order = {
            organization_overview: 0,
            organization_billing: 1,
            organization_team: 2,
            organization_process: 3
        }
        return order[screen.screenKey || screen.id] ?? 100
    }

    const userMenuItems = computed(() => {
        const items = [];
        const canOpenGeneratedRoute = (route) => !authStore.processActive || navStore.processAllowsRoute(route);

        // 1. Current Organization & Context
        if (authStore.organizationData && organizationSystemScreens.value.length) {
            const organizationItems = organizationSystemScreens.value.map(screen => ({
                label: screenName(screen),
                icon: screen.icon || screenIcon(screen),
                command: () => router.push(screen.route)
            }));
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
                    icon: org.id === authStore.userData.organizationId?.toString() ? 'pi pi-check text-status-success' : 'pi pi-building',
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
                    label: t('common.toggleTheme'),
                    icon: themeIcon.value,
                    command: toggleTheme
                },
                {
                    label: t('nav.profile'),
                    icon: 'pi pi-user',
                    command: () => navigateMobile('/profile')
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
