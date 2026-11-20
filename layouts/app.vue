<template>
    <div
        :class="[
            'flex flex-col bg-page',
            isBoundedWorkspaceRoute ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'
        ]"
    >
    <header v-if="!isGeneratedHomeRoute && !isStandaloneDesignerRoute" class="sticky top-0 z-50 hidden shrink-0 border-b [border-color:var(--ck-chrome-border)] bg-chrome text-[var(--ck-chrome-foreground)] backdrop-blur-md md:block">
            <nav class="max-w-[var(--ck-page-max-width)] mx-auto px-4 h-14 flex items-center justify-between gap-2 ">
                <!-- Left: Logo & Breadcrumbs -->
                <div class="flex items-center h-full min-w-0 flex-1">
                    <NuxtLink
                        to="/"
                        class="flex items-center gap-2 no-underline text-primary whitespace-nowrap hover:opacity-80 transition-opacity mr-2 shrink-0 text-section-heading"
                    >
                        <img src="/logo-light.svg" alt="Perigram" class="h-8 w-auto dark:hidden" />
                        <img src="/logo-dark.svg" alt="Perigram" class="hidden h-8 w-auto dark:block" />
                    </NuxtLink>

                    <div class="flex items-center gap-0 overflow-hidden min-w-0">
                        <div
                            v-for="(crumb, index) in breadcrumbs"
                            :key="index"
                            class="flex items-center gap-0 shrink-0"
                        >
                            <span v-if="index > 0" class="mx-0.5 shrink-0 text-[var(--ck-chrome-muted)] opacity-50">/</span>
                            <Button
                                as="router-link"
                                :to="crumb.to"
                                text
                                severity="secondary"
                                class="!text-[var(--ck-chrome-foreground)] whitespace-nowrap max-w-[80px] sm:max-w-[120px] md:max-w-none truncate px-1 md:px-2"
                            >
                                {{ crumb.name }}
                            </Button>
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

        <main :class="['flex min-h-0 w-full flex-1 flex-col mx-auto', mainClass]">
            <slot />
        </main>

        <!-- One chat popup for every viewport; the shared wrapper owns the
             Dialog surface (stacking, tokens, hidden header). -->
        <ChatSupportDialog v-model:visible="supportDialog" :label="t('support.chatTitle')">
            <ChatSupport />
        </ChatSupportDialog>
        <!-- The entity popup: the shared dialog surface for inspecting a
             record from floating chrome (chat headers) without leaving the
             current route; its expand action opens the home pane. -->
        <EntityPopup />
        <nav
            v-if="authStore.userIsSet"
            class="fixed inset-x-0 bottom-0 z-[998] border-t [border-color:var(--ck-chrome-border)] bg-chrome px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-overlay md:hidden"
            :aria-label="$t('nav.home')"
        >
        <!-- Mobile app tabs run on PrimeVue Tabs: the home workspace tree's
              top level (root type screens) and chats are real tabs of one
              strip. User-added shortcuts and the home tab are disabled
              while the home workspace migration settles; a type tab
              selects that screen in the home workspace (navigating home
              first when another route is open), the chats tab opens the
              bounded /chats route, and organizations without compiled type
              screens keep a home fallback. The profile trigger remains the
              bar's only action. Tab internals are adapted for the bottom
              bar through pt (see bottomBar pt objects in the script):
              inline pt styles outrank every stylesheet rule, so the
              adaptation cannot be flipped by build-time CSS order. -->
            <div class="mx-auto flex max-w-md items-center gap-1">
                <Tabs :value="mobileTabValue" class="min-w-0 flex-1" @update:value="selectMobileTab">
                    <TabList class="w-full" :pt="bottomBarTabListPt">
                        <Tab
                            v-for="tab in mobileHomeTabs"
                            :key="tab.key"
                            :value="tab.key"
                            :pt="bottomBarTabPt"
                            :aria-label="tab.label"
                            :title="tab.label"
                        >
                            <i :class="tab.icon" aria-hidden="true" />
                        </Tab>
                        <Tab v-if="!mobileHomeTabs.length" value="home" :pt="bottomBarTabPt" :aria-label="$t('nav.home')">
                            <i class="pi pi-home" aria-hidden="true" />
                        </Tab>
                        <Tab value="chats" :pt="bottomBarTabPt" :aria-label="$t('support.openChat')">
                            <span v-if="supportChatStore.totalUnread" class="inline-flex items-center gap-1">
                                <i class="pi pi-comments" aria-hidden="true" />
                                <Badge :value="supportChatStore.totalUnread" severity="danger" size="small" />
                            </span>
                            <i v-else class="pi pi-comments" aria-hidden="true" />
                        </Tab>
                    </TabList>
                </Tabs>
                <UserAccountMenu v-if="authStore.userIsSet">
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
        <!-- Every floating launcher utility lives on the plain wrapper, never
             on the PrimeVue component: PrimeVue injects .p-button rules
             (display: inline-flex, position: relative, icon-only sizing) after
             Tailwind and wins the cascade at equal specificity. The button
             therefore ignored `fixed` (it computed to relative and drifted to
             the flow at x=-32) and ignored h-14/w-14 as well. The wrapper owns
             the viewport anchoring, the responsive visibility, and the stacking
             step, matching the call/offline surfaces; the button keeps only
             its own chrome. -->
        <div v-if="!supportDialog && !isChatsRoute && !isGeneratedHomeRoute" class="fixed bottom-8 right-8 z-[999] hidden md:block">
            <Button
                data-testid="desktop-chat-launcher"
                icon="pi pi-comment"
                severity="secondary"
                rounded
                size="large"
                :aria-label="$t('support.openChat')"
                @click="openDesktopChatDrawer"
                class="shadow-overlay"
            />
        </div>
        <IncomingCalls v-if="authStore.userIsSet" />
        <OfflineOutboxBadge v-if="authStore.userIsSet" />
        <CallFloatingWindow v-if="authStore.userIsSet" />
        <!-- App-level remote-call audio: mounts once beside the room
             session so call audio survives every surface move (SPEC §11). -->
        <CallAudioRenderer v-if="authStore.userIsSet && callsStore.session" />
        <MediaDock v-if="authStore.userIsSet" />
        <!-- The profile settings popup follows the same single-host law:
             one instance for the whole layout, opened through the shared
             useProfileDialog state by every account-menu instance and
             record surface. -->
        <ProfileSettingsDialog v-if="authStore.userIsSet" />
        <!-- The app-level default confirmation host: one instance for the
             whole layout. Feature surfaces (chat, calls, generated screens)
             call useConfirm without a group; mounting a second host anywhere
             else renders the same require twice. The Toast host follows the
             same single-host law: every toast.add() on app surfaces renders
             here. -->
        <ConfirmDialog />
        <Toast />
    </div>
</template>

<script setup>
    import { ref, computed, provide, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import Button from 'primevue/button'
    import Badge from 'primevue/badge'
    import Menu from 'primevue/menu'
    import ConfirmDialog from 'primevue/confirmdialog'
    import Toast from 'primevue/toast'
    import Tabs from 'primevue/tabs'
    import TabList from 'primevue/tablist'
    import Tab from 'primevue/tab'
    import ChatSupportDialog from '~/components/shared/ChatSupportDialog.vue';
    import EntityPopup from '~/components/shared/EntityPopup.vue'
    import UserAccountMenu from '~/components/shared/UserAccountMenu.vue'
    import OfflineOutboxBadge from '~/components/shared/OfflineOutboxBadge.vue'
    import IncomingCalls from '~/components/calls/IncomingCalls.vue'
    // Heavy shell surfaces load as async chunks instead of entry-chunk weight.
    const ChatSupport = defineAsyncComponent(() => import('~/components/ChatSupport.vue'))
    const ProfileSettingsDialog = defineAsyncComponent(() => import('~/components/shared/ProfileSettingsDialog.vue'))
    const CallFloatingWindow = defineAsyncComponent(() => import('~/components/calls/CallFloatingWindow.vue'))
    const MediaDock = defineAsyncComponent(() => import('~/components/media/MediaDock.vue'))
    const CallAudioRenderer = defineAsyncComponent(() => import('~/components/calls/CallAudioRenderer.vue'))
    import { useCallsStore } from '~/stores/calls'
    import { useSupportDialog } from '~/composables/useModalState'
    import { useAuthStore } from '~/stores/auth'
    import { useSupportChatStore } from '~/stores/supportChat'
    import { useEntityEventsStore } from '~/stores/instanceEvents'
    import { useNavigationStore } from '~/stores/navigation'
    import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT } from '~/utils/mobile-transient-surfaces.js'
    import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js'
    import { resolveDefaultHomeScreen, resolveProcessEntryRoute, screenByKey } from '~/utils/process-navigation.js'
    import { HOME_SCREEN_ROUTE } from '@perigram/processes/screen-contract'
    import { useMobileHomeTabs } from '~/composables/useMobileHomeTabs.js'
    import { useThemeMode } from '~/composables/useThemeMode.js'

    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    const supportDialog = useSupportDialog()
    const authStore = useAuthStore()
    const supportChatStore = useSupportChatStore()
    const entityEventsStore = useEntityEventsStore()
    const callsStore = useCallsStore()
    const navStore = useNavigationStore()
    const ssrFetchOptions = process.server ? { headers: useRequestHeaders(['cookie']) } : {}
    // The mobile tab strip mirrors the home workspace tree's top level
    // (shared selection state — the home workspace renders the selected
    // type screen in its mobile branch).
    const { tabs: mobileHomeTabs, activeKey: mobileHomeTabKey, selectTab: selectMobileHomeTab } = useMobileHomeTabs()

    // Bottom-bar adaptation of the Aura tab strip, applied through pt —
    // inline styles stay immune to stylesheet cascade questions entirely.
    // The strip paints no surface (chrome owns the
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

    watch([() => route.fullPath, () => authStore.userIsSet], async ([, isSet]) => {
        if (isSet) await navStore.fetchRouteHierarchy(route.path, route.query, ssrFetchOptions)
    }, { immediate: true })

    onMounted(async () => {
        window.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeMobileTransientSurfaces)
    })

    onUnmounted(() => {
        window.removeEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, closeMobileTransientSurfaces)
    })

    watch(() => authStore.userIsSet, (isSet) => {
        if (isSet) {
            supportChatStore.connect()
            callsStore.connect()
            entityEventsStore.connect()
        } else {
            supportChatStore.disconnect()
            callsStore.disconnect()
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
        breadcrumbMenuItems.value = breadcrumbAlternatives(crumb).map((sibling) => ({
            label: sibling.name,
            command: () => router.push(sibling.id || sibling.to)
        }))
        breadcrumbMenu.value?.toggle(event)
    }
    const breadcrumbAlternatives = (crumb = {}) => (crumb.siblings || [])
        .filter(sibling => (sibling.id || sibling.to) && (sibling.id || sibling.to) !== crumb.to)

    const activeGeneratedScreen = computed(() => {
        // Home serves at the stable shell route (HOME_SCREEN_ROUTE — the
        // screens route's alias): the manifest home screen IS the active
        // screen there, even though no screenKey param exists to match.
        if (route.path === HOME_SCREEN_ROUTE) {
            return authStore.screenManifest.find(screen => screen.template === 'home')
                || resolveDefaultHomeScreen(authStore.screenManifest);
        }
        if (!route.path.startsWith('/screens/')) return null
        const rawKey = route.params.screenKey
        const screenKey = Array.isArray(rawKey) ? rawKey.join('/') : rawKey
        // Home is the default screen: unresolved keys carry the home
        // fallback so the workspace chrome (hidden desktop header, bounded
        // viewport) matches what the screens route renders.
        return screenByKey(authStore.screenManifest, screenKey)
            || resolveDefaultHomeScreen(authStore.screenManifest)
    })
    const isGeneratedWorkspaceRoute = computed(() => Boolean(
        resolveGeneratedScreenOverload(activeGeneratedScreen.value)
    ))
    // The generated home workspace owns the full desktop viewport: its sidebar
    // carries brand, navigation, and the user controls that the desktop
    // navbar provides on other routes. The standalone designer route fills
    // the viewport the same way — the editor's file panel is its chrome.
    const isGeneratedHomeRoute = computed(() => activeGeneratedScreen.value?.template === 'home')
    const isStandaloneDesignerRoute = computed(() => route.path === '/organization/process')
    const isChatsRoute = computed(() => route.path === '/chats' || route.path.startsWith('/chats/'))
    const isBoundedWorkspaceRoute = computed(() => (
        isGeneratedWorkspaceRoute.value
        || isStandaloneDesignerRoute.value
        || isChatsRoute.value
    ))
    const isAccountRoute = computed(() => route.path.startsWith('/organization'))
    const isFlushMobileSurface = computed(() => isAccountRoute.value || isChatsRoute.value)
    // The main element's route-class chain, one branch per surface kind.
    const mainClass = computed(() => {
        if (isStandaloneDesignerRoute.value) return 'max-w-none overflow-hidden p-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'
        if (isFlushMobileSurface.value) return 'max-w-none overflow-hidden p-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:max-w-[var(--ck-page-max-width)] md:overflow-visible md:p-6 lg:p-8'
        if (isGeneratedWorkspaceRoute.value) return 'max-w-none overflow-hidden p-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'
        if (isBoundedWorkspaceRoute.value) return 'max-w-[var(--ck-page-max-width)] overflow-hidden px-3 pt-3 pb-24 md:p-4'
        return 'max-w-[var(--ck-page-max-width)] px-4 pt-4 pb-24 md:p-6 lg:p-8'
    })
    // The home tab follows the entry ladder: compiled home, first hub, or
    // the default home route — never a non-screen destination (the landing
    // redirects authenticated users away).
    const homeRoute = computed(() => resolveProcessEntryRoute({
        screens: authStore.screenManifest,
        navigation: authStore.navigationManifest
    }))

    const closeMobileTransientSurfaces = () => {
        supportDialog.value = false
        breadcrumbMenu.value?.hide?.()
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
        if (isGeneratedHomeRoute.value) return mobileHomeTabKey.value
        return mobileTabForScreensRoute()
    })

    // A routed screen keeps its owning type tab selected: the detail
    // screen of a type still belongs to that tab's section, so opening a
    // record never leaves the bar without a selected tab.
    function mobileTabForScreensRoute() {
        if (!route.path.startsWith('/screens/')) return null
        const rawKey = route.params.screenKey
        const key = (Array.isArray(rawKey) ? rawKey.join('/') : rawKey) || ''
        const baseKey = String(key).replace(/_detail$/, '')
        const manifestScreen = screenByKey(authStore.screenManifest, baseKey)
        const typeId = manifestScreen?.typeId || ''
        if (!typeId) return null
        return mobileHomeTabs.value.find(tab => tab.screen?.typeId === typeId)?.key || null
    }

    const selectMobileTab = (value) => {
        if (value === 'chats') {
            navigateMobile('/chats')
            return
        }
        if (value === 'home') {
            navigateMobile(homeRoute.value)
            return
        }
        // A type tab selects that screen inside the home workspace; from
        // any other route the tab navigates home first.
        selectMobileHomeTab(value)
        if (!isGeneratedHomeRoute.value) navigateMobile(homeRoute.value)
    }

    const navigateMobile = (to) => {
        requestCloseTransientSurfaces()
        router.push(to)
    }

    // Theme initialization and auth bootstrap share one mount pass.
    useThemeMode()

    onMounted(async () => {
        if (!authStore.userIsSet) {
            await authStore.setUser();
        }
    })
</script>
