<template>
    <div
        :class="[
            'flex flex-col bg-page',
            isBoundedWorkspaceRoute ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'
        ]"
    >
    <header v-if="!isGeneratedHomeRoute" class="chrome-signal-rule sticky top-0 z-50 hidden shrink-0 border-b [border-color:var(--ck-chrome-border)] bg-chrome text-[var(--ck-chrome-foreground)] backdrop-blur-md md:block">
            <nav class="max-w-[var(--ck-page-max-width)] mx-auto px-4 h-14 flex items-center justify-between gap-2 ">
                <!-- Left: Logo & Breadcrumbs -->
                <div class="flex items-center h-full min-w-0 flex-1">
                    <NuxtLink
                        to="/"
                        class="flex items-center gap-2 no-underline text-primary whitespace-nowrap hover:opacity-80 transition-opacity mr-2 shrink-0 text-section-heading"
                    >
                        <img src="/logo-light.svg" alt="CutKit" class="h-8 w-auto dark:hidden" />
                        <img src="/logo-dark.svg" alt="CutKit" class="hidden h-8 w-auto dark:block" />
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
                                class="p-button p-component p-button-text p-button-secondary !text-[var(--ck-chrome-foreground)] whitespace-nowrap max-w-[80px] sm:max-w-[120px] md:max-w-none truncate px-1 md:px-2"
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

                <!-- Right: User -->
                <div class="flex items-center gap-2 shrink-0">
                    <div class="relative flex items-center" v-if="authStore.userIsSet">
                        <UserAccountMenu />
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
            <slot />
        </main>

        <!-- One chat popup for every viewport, hosted by PrimeVue Dialog:
             PrimeVue owns stacking (overlay z above the app chrome). The
             dialog is a real bounded card everywhere — support-chat token
             size, capped to the viewport minus breathing room so the soft
             keyboard can never cover the composer (interactive-widget
             resizes the viewport). Non-modal on purpose: desktop keeps
             working under the chat. The chat renders its own inbox/thread
             headers with back and close, so the Dialog header stays
             hidden, and the surface is pinned to the app content token. -->
        <Dialog
            v-model:visible="supportDialog"
            :close-on-escape="false"
            :aria-label="t('support.chatTitle')"
            :style="{ width: 'min(94vw, 25rem)' }"
            :pt="chatDialogPt"
        >
            <!-- Height lives on this dedicated wrapper: the ChatSupport
                 root already carries h-full, and merging a second height
                 utility there resolves by CSS order — that produced the
                 content-driven (growing) dialog. -->
            <div v-if="supportDialog" class="h-support-chat max-h-[calc(100dvh-6rem)]">
                <ChatSupport />
            </div>
        </Dialog>
        <!-- Add-screen tier: popup TieredMenu anchored at the Add screen row
             inside the profile menu. It self-hides after a leaf pick; the
             item commands close the remaining transient chrome. -->
        <TieredMenu ref="mobileScreenTierMenu" :model="mobileScreenMenuItems" :popup="true" />
        <!-- Replace-shortcut picker for the long-press flow: anchored at the
             pressed tab, flips above the bar. -->
        <Popover ref="mobileScreenMenu">
            <div class="flex min-w-56 flex-col gap-1">
                <template v-for="(item, index) in mobileScreenMenuItems" :key="index">
                    <Divider v-if="item.separator" class="my-1" />
                    <Button
                        v-else
                        :label="item.label"
                        :icon="item.icon"
                        text
                        severity="secondary"
                        size="small"
                        class="w-full !justify-start"
                        @click="runMobileScreenMenuItem(item)"
                    />
                </template>
            </div>
        </Popover>
        <nav
            v-if="authStore.userIsSet"
            class="chrome-signal-rule fixed inset-x-0 bottom-0 z-[998] border-t [border-color:var(--ck-chrome-border)] bg-chrome px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-overlay md:hidden"
            :aria-label="$t('nav.home')"
        >
            <!-- Mobile app tabs run on PrimeVue Tabs: home, user shortcuts, and
                 chats are real tabs of one strip, and every tab navigates — the
                 chats tab opens the bounded /chats route exactly like the home
                 and shortcut tabs open their routes. The profile trigger is the
                 bar's only action and owns the Add screen entry through its
                 menu's items slot. Tab internals are adapted for the bottom bar
                 through pt (see bottomBar pt objects in the script): PrimeVue
                 runtime styles load after Tailwind, so utility classes cannot
                 restyle tab strip internals. -->
            <div class="mx-auto flex max-w-md items-center gap-1">
                <Tabs :value="mobileTabValue" class="min-w-0 flex-1" @update:value="selectMobileTab">
                    <TabList class="w-full" :pt="bottomBarTabListPt">
                        <Tab value="home" :pt="bottomBarTabPt" :aria-label="$t('nav.home')">
                            <i class="pi pi-home" aria-hidden="true" />
                        </Tab>
                        <Tab
                            v-for="shortcut in mobileShortcutLinks"
                            :key="shortcut.key"
                            :value="`shortcut:${shortcut.key}`"
                            :pt="bottomBarTabPt"
                            :aria-label="shortcut.label"
                            @pointerdown="startShortcutHold($event, shortcut.index)"
                            @pointerup="clearShortcutHold"
                            @pointerleave="clearShortcutHold"
                            @pointercancel="clearShortcutHold"
                            @contextmenu.prevent="openReplaceShortcutMenu($event, shortcut.index)"
                        >
                            <i :class="shortcut.icon" aria-hidden="true" />
                        </Tab>
                        <Tab value="chats" :pt="bottomBarTabPt" :aria-label="$t('support.openChat')">
                            <span class="relative inline-flex">
                                <i class="pi pi-comments" aria-hidden="true" />
                                <Badge
                                    v-if="supportChatStore.totalUnread"
                                    :value="supportChatStore.totalUnread"
                                    severity="danger"
                                    size="small"
                                    class="absolute -right-2 -top-2"
                                />
                            </span>
                        </Tab>
                    </TabList>
                </Tabs>
                <UserAccountMenu v-if="authStore.userIsSet">
                    <template #items>
                        <!-- Add screen is a menu tier: the row opens a popup
                             TieredMenu flyout with the screen list instead of
                             embedding the screens in this menu. -->
                        <section
                            v-if="mobileShortcutLinks.length < MOBILE_SHORTCUT_LIMIT && mobileScreenMenuItems.length"
                            class="flex flex-col gap-1"
                        >
                            <Button
                                text
                                severity="secondary"
                                size="small"
                                class="w-full !justify-start"
                                :aria-label="$t('nav.addScreen')"
                                @click="toggleMobileScreenTier"
                            >
                                <i class="pi pi-plus" aria-hidden="true" />
                                <span>{{ $t('nav.addScreen') }}</span>
                                <i class="pi pi-chevron-right ml-auto" aria-hidden="true" />
                            </Button>
                        </section>
                    </template>
                    <template #trigger="{ toggle }">
                        <Button
                            icon="pi pi-user"
                            text
                            rounded
                            severity="secondary"
                            :aria-label="$t('nav.profile')"
                            @click="toggle"
                        />
                    </template>
                </UserAccountMenu>
            </div>
        </nav>
        <!-- Tailwind display utilities must not sit on PrimeVue components:
             PrimeVue injects .p-button { display: inline-flex } after Tailwind
             and wins the cascade, which made this desktop launcher render as a
             floating chats bubble on mobile. The plain wrapper owns the
             responsive visibility instead. -->
        <div v-if="!supportDialog && !isChatsRoute && !isGeneratedHomeRoute" class="hidden md:block">
            <Button
                data-testid="desktop-chat-launcher"
                icon="pi pi-comment"
                severity="secondary"
                rounded
                size="large"
                :aria-label="$t('support.openChat')"
                @click="openDesktopChatDrawer"
                class="fixed bottom-8 right-8 z-[999] h-14 w-14 shadow-overlay"
            />
        </div>
        <IncomingCalls v-if="authStore.userIsSet" />
        <OfflineOutboxBadge v-if="authStore.userIsSet" />
        <CallFloatingWindow v-if="authStore.userIsSet" />
    </div>
</template>

<script setup>
    import { ref, computed, provide, watch, onMounted, onUnmounted } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Button from 'primevue/button'
    import Badge from 'primevue/badge'
    import Divider from 'primevue/divider'
    import Menu from 'primevue/menu'
    import Popover from 'primevue/popover'
    import TieredMenu from 'primevue/tieredmenu'
    import Dialog from 'primevue/dialog'
    import Tabs from 'primevue/tabs'
    import TabList from 'primevue/tablist'
    import Tab from 'primevue/tab'
    import ChatSupport from '~/components/ChatSupport.vue'
    import UserAccountMenu from '~/components/shared/UserAccountMenu.vue'
    import OfflineOutboxBadge from '~/components/shared/OfflineOutboxBadge.vue'
    import IncomingCalls from '~/components/calls/IncomingCalls.vue'
    import CallFloatingWindow from '~/components/calls/CallFloatingWindow.vue'
    import { useCallsStore } from '~/stores/calls'
    import { useSupportDialog } from '~/composables/useModalState'
    import { useAuthStore } from '~/stores/auth'
    import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js'
    import { useSupportChatStore } from '~/stores/supportChat'
    import { useNavigationStore } from '~/stores/navigation'
    import { useGlobalStore } from '~/stores/global'
    import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT } from '~/utils/mobile-transient-surfaces.js'
    import { generatedScreenLabel } from '~/utils/generated-labels.js'
    import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js'

    const router = useRouter()
    const route = useRoute()
    const { t, te } = useI18n()
    const supportDialog = useSupportDialog()
    // Popup chrome pass-through: Dialog supplies structure and stacking,
    // the app tokens supply the surface (Dialog's own background token is a
    // lighter gray — the chat must match the content surface everywhere
    // else). The chat component supplies its own headers and controls, so
    // the Dialog header is hidden entirely.
    const chatDialogPt = {
        root: { class: 'bg-content !rounded-ui' },
        header: { class: 'hidden' },
        content: { class: 'p-0 overflow-hidden' }
    }
    const authStore = useAuthStore()
    const domainUi = useCutkitDomainUi()
    provide('statusWorkflows', computed(() => authStore.statusWorkflows))
    const supportChatStore = useSupportChatStore()
    const callsStore = useCallsStore()
    const navStore = useNavigationStore()
    const globalStore = useGlobalStore()
    const ssrFetchOptions = process.server ? { headers: useRequestHeaders(['cookie']) } : {}
    const mobileShortcuts = ref([])
    const mobileShortcutReplaceIndex = ref(null)
    const mobileShortcutHoldTriggered = ref(false)
    const mobileShortcutHoldTimer = ref(null)
    const MOBILE_SHORTCUT_LIMIT = 2

    // Bottom-bar adaptation of the Aura tab strip, applied through pt because
    // PrimeVue runtime styles load after Tailwind and override utility
    // classes on tab internals. The strip paints no surface (chrome owns the
    // bar), drops its own bottom border line and sliding accent bar, and the
    // selected indicator moves to the tab's top edge — the edge nearest the
    // content — while tabs stretch to equal widths across the full bar.
    const bottomBarTabListPt = {
        root: { style: { background: 'transparent' } },
        tabList: { style: { borderWidth: 0 } },
        activeBar: { style: { display: 'none' } }
    }
    const bottomBarTabPt = {
        root: ({ context }) => ({
            style: {
                display: 'flex',
                flex: '1 1 0',
                justifyContent: 'center',
                borderWidth: '2px 0 0 0',
                borderColor: context?.active ? 'var(--p-primary-color)' : 'transparent'
            }
        })
    }

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
            callsStore.connect()
        } else {
            supportChatStore.disconnect()
            callsStore.disconnect()
        }
    }, { immediate: true })

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
    // The generated home workspace owns the full desktop viewport: its sidebar
    // carries brand, navigation, and the user controls that the desktop
    // navbar provides on other routes.
    const isGeneratedHomeRoute = computed(() => activeGeneratedScreen.value?.template === 'home')
    const isStandaloneDesignerRoute = computed(() => route.path === '/organization/process')
    const isChatsRoute = computed(() => route.path === '/chats' || route.path.startsWith('/chats/'))
    const isBoundedWorkspaceRoute = computed(() => (
        isGeneratedWorkspaceRoute.value
        || isStandaloneDesignerRoute.value
        || isChatsRoute.value
        || /^\/project\/[^/]+\/queues\/?$/.test(route.path)
    ))
    const isAccountRoute = computed(() => route.path === '/profile' || route.path.startsWith('/organization'))
    const isFlushMobileSurface = computed(() => isAccountRoute.value || isChatsRoute.value)
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
        command: () => {
            addMobileScreenShortcut(screen)
            // Close the profile menu (and any other transient chrome) after a
            // pick; the TieredMenu hides itself on leaf click.
            requestCloseTransientSurfaces()
        }
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
        breadcrumbMenu.value?.hide?.()
        mobileScreenMenu.value?.hide?.()
    }

    const requestCloseTransientSurfaces = () => {
        window.dispatchEvent(new CustomEvent(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT))
    }

    // The floating launcher is desktop-only: it opens the drawer surface.
    // Mobile viewports never see a floating chat bubble; their entry is the
    // chats tab of the bottom strip, which navigates to /chats.
    const openDesktopChatDrawer = () => {
        requestCloseTransientSurfaces()
        supportDialog.value = true
    }

    // --- Mobile app tabs (PrimeVue Tabs bottom strip) ---
    const mobileTabValue = computed(() => {
        if (isChatsRoute.value) return 'chats'
        const shortcut = mobileShortcutLinks.value.find(item => isRouteActive(item.to))
        if (shortcut) return `shortcut:${shortcut.key}`
        if (isRouteActive(homeRoute.value)) return 'home'
        return null
    })

    const selectMobileTab = (value) => {
        if (mobileShortcutHoldTriggered.value) {
            mobileShortcutHoldTriggered.value = false
            return
        }
        if (value === 'chats') {
            navigateMobile('/chats')
            return
        }
        if (value === 'home') {
            navigateMobile(homeRoute.value)
            return
        }
        if (typeof value === 'string' && value.startsWith('shortcut:')) {
            const shortcut = mobileShortcutLinks.value.find(item => `shortcut:${item.key}` === value)
            if (shortcut?.to) navigateMobile(shortcut.to)
        }
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

    // Tier-2 of the profile menu: the Add screen row toggles a popup
    // TieredMenu anchored at that row (a real click on a still-mounted
    // element, unlike a synthetic anchor). The replace picker Popover below
    // serves only the long-press flow on a shortcut tab.
    const mobileScreenTierMenu = ref()

    const toggleMobileScreenTier = (event) => {
        mobileShortcutReplaceIndex.value = null
        mobileScreenTierMenu.value?.toggle(event)
    }

    const runMobileScreenMenuItem = (item) => {
        mobileScreenMenu.value?.hide?.()
        item?.command?.()
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
        return domainUi.getIcon(screen.entityType)
    }

    watch(mobileShortcutStorageKey, loadMobileShortcuts)

    const mobileScreenMenu = ref();
    onMounted(async () => {
        if (!authStore.userIsSet) {
            await authStore.setUser();
        }
    });

    // --- Theme Switcher ---
    const themeCookie = useCookie('theme-mode')

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
