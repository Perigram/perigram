<template>
    <div class="surface-0">
        <Menubar
            :model="menuItems"
            class="app-menubar rounded-none border-x-0 border-t-0 border-b border-300 py-0"
        >
            <template #start>
                <NuxtLink
                    to="/projects"
                    class="logo"
                >
                    <span>CutKit</span>
                </NuxtLink>
                <Divider layout="vertical" />
                <Breadcrumb
                    :home="breadcrumbHome"
                    :model="breadcrumbItems"
	  class="p-2 bg-transparent"
                >
                    <template #item="{ item }">
                        <Select
                            v-model="breadcrumbItems[0]"
			    :options="breadcrumbItems[0] ? [breadcrumbItems[0]] : []"
                            class="mr-2"
	                    icon="pi pi-chevron-down"
                        />
                    </template>

                    <template #separator> / </template>
                </Breadcrumb>
            </template>

            <template #end>
                <div class="header-end">
                    <UserBalance />

                    <Button
                        icon="pi pi-user"
                        :label="userInitials"
                        severity="info"
                        text
                        @click="toggleProfileMenu"
                        aria-haspopup="true"
                        aria-controls="profile_menu"
                    />
                    <Menu
                        ref="profileMenu"
                        id="profile_menu"
                        :model="profileMenuItems"
                        :popup="true"
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
    import { ref, computed, watch } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import { useColorMode } from '@vueuse/core'
    import Menubar from 'primevue/menubar'
    import Breadcrumb from 'primevue/breadcrumb'
    import Divider from 'primevue/divider'
    import Button from 'primevue/button'
    import Menu from 'primevue/menu'
    import Chip from 'primevue/chip'
    import UserBalance from '~/components/UserBalance.vue'
    import ChatSupport from '~/components/ChatSupport.vue'
    import { useSupportDialog } from '~/composables/useModalState'

    const router = useRouter()
    const route = useRoute()
    const { $i18n } = useNuxtApp()
    const supportDialog = useSupportDialog()

    const mode = useColorMode()
    const profileMenu = ref()

    const isDarkMode = ref(localStorage.getItem('darkMode') === 'true')
    const themeIcon = computed(() => (!isDarkMode ? 'pi pi-sun' : 'pi pi-moon'))
    
    const userInitials = computed(() => 'U') // TODO: Get from auth

    const { data: currentProject } = await useAsyncData(
        'current-project',
        () => {
            const slug = route.params.slug
            if (slug) {
                return $fetch(`/api/project/${slug}`)
            }
            return Promise.resolve(null)
        },
        {
            watch: [() => route.params.slug]
        }
    )

    const isAssetsPage = computed(() => route.path.startsWith('/assets'))

    const menuItems = ref([]) // Empty - using custom start/end templates

    const breadcrumbHome = computed(() => ({
        label: $i18n.t('navigation.projects'),
        command: () => router.push('/projects'),
    }))

    const breadcrumbItems = computed(() => {
        if (currentProject.value) {
            return [{ label: currentProject.value.name }]
        }
        return []
    })

    watch(isDarkMode, (value) => {
        if (value) {
            document.documentElement.classList.add('dark-mode')
        } else {
            document.documentElement.classList.remove('dark-mode')
        }
        localStorage.setItem('dark-mode', String(value))
    })

    const toggleTheme = () => {
        isDarkMode.value = !isDarkMode.value
    }

    const toggleProfileMenu = (event) => {
        profileMenu.value.toggle(event)
    }

    const profileMenuItems = computed(() => [
        {
            label: $i18n.t('navigation.assets'),
            icon: 'pi pi-folder',
            command: () => router.push('/assets'),
        },
        {
            label: $i18n.t('profile.title'),
            icon: 'pi pi-user',
            command: () => router.push('/profile'),
        },
        {
            separator: true,
        },
        {
            label: $i18n.t('common.toggleTheme'),
            icon: 'pi pi-' + (mode.value === 'dark' ? 'sun' : 'moon'),
            command: () => toggleTheme(),
        },
        {
            separator: true,
        },
        {
            label: $i18n.t('auth.logout'),
            icon: 'pi pi-sign-out',
            command: () => router.push('/auth/logout'),
        },
    ])
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
