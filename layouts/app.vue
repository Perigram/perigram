<template>
    <div class="flex flex-col min-h-screen bg-[var(--p-surface-ground)]">
        <Menubar
            :model="[]"
            class="rounded-none border-0 sticky top-0 z-50 px-4 py-2"
        >
            <template #start>
                <NuxtLink
                    to="/"
                    class="flex items-center gap-2 no-underline text-[var(--p-primary-color)] text-xl font-bold whitespace-nowrap hover:opacity-80 transition-opacity mr-4"
                >
                    <span>CutKit</span>
                </NuxtLink>

                <Divider layout="vertical" class="mx-2 hidden md:block" />
                
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
                <div class="flex items-center gap-4">
                    <Button
                        :icon="themeIcon"
                        @click="toggleTheme"
                        text
                        rounded
                        :aria-label="$t('common.toggleTheme')"
                    />
                    
                    <div class="relative" v-if="authStore.userIsSet">
                        <Button 
                            type="button" 
                            @click="toggleUserMenu" 
                            class="p-0 rounded-full overflow-hidden border-2 border-transparent hover:border-[var(--p-primary-color)] transition-colors"
                            text
                        >
                            <Avatar 
                                :label="authStore.userData.name ? authStore.userData.name[0].toUpperCase() : 'U'" 
                                shape="circle" 
                                size="large" 
                                class="bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)]"
                            />
                        </Button>
                        <Menu ref="userMenu" :model="userMenuItems" :popup="true" />
                    </div>
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
    import Menu from 'primevue/menu'
    import Avatar from 'primevue/avatar'
    import ChatSupport from '~/components/ChatSupport.vue'
    import { useSupportDialog } from '~/composables/useModalState'
    import { API_ROUTES } from '~/composables/apiRoutes'
    import { useAuthStore } from '~/stores/auth'
    import { useNavigationStore } from '~/stores/navigation'

    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    const supportDialog = useSupportDialog()
    const authStore = useAuthStore()
    const navStore = useNavigationStore()
    const globalStore = useGlobalStore()

    // Organizations for switcher
    const userOrgs = ref([])
    const fetchUserOrgs = async () => {
        if (authStore.userIsSet) {
            try {
                userOrgs.value = await $fetch('/api/auth/organizations')
            } catch (err) {
                console.error('Failed to fetch user organizations:', err)
            }
        }
    }

    // Sync user organizations when user is set
    watch(() => authStore.userIsSet, async (isSet) => {
        if (isSet) {
            await fetchUserOrgs()
        }
    }, { immediate: true })

    // Sync project context when route changes
    watch(() => route.params.slug, async (newSlug) => {
        await navStore.fetchProjectContext(newSlug)
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
        const items = [
            {
                label: authStore.userData.name || 'User',
                items: [
                    {
                        label: t('nav.profile'),
                        icon: 'pi pi-user',
                        command: () => router.push('/profile')
                    }
                ]
            }
        ];

        // Organization Switcher Section
        if (userOrgs.value.length > 1) {
            items.push({
                label: t('auth.organization'),
                items: userOrgs.value.map(org => ({
                    label: org.name,
                    icon: org._id.toString() === authStore.userData.organizationId?.toString() ? 'pi pi-check' : 'pi pi-building',
                    command: async () => {
                        if (org._id.toString() !== authStore.userData.organizationId?.toString()) {
                            await authStore.switchOrganization(org._id);
                            router.push('/'); // Redirect to home to refresh context
                        }
                    }
                }))
            });
        }

        if (authStore.isSuperAdmin) {
            items.push({
                label: t('roles.SuperAdmin'),
                items: [
                    {
                        label: t('features.users'),
                        icon: 'pi pi-users',
                        command: () => router.push('/admin/users')
                    },
                    {
                        label: t('features.organizations'),
                        icon: 'pi pi-building',
                        command: () => router.push('/admin/organizations')
                    }
                ]
            });
        }
        
        if (authStore.isOrgAdmin) {
            items.push({
                label: t('auth.organization'),
                items: [
                    {
                        label: t('features.users'),
                        icon: 'pi pi-users',
                        command: () => router.push('/organization/users')
                    }
                ]
            });
        }

        items.push({
            separator: true
        }, {
            label: t('nav.logout'),
            icon: 'pi pi-sign-out',
            command: async () => {
                await authStore.logout();
                router.push('/auth/login');
            }
        });

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
            await fetchUserOrgs()
        }
    })
</script>

<style scoped lang="scss">
</style>

