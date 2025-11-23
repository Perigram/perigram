<template>
    <div class="dashboard-layout">
        <header class="dashboard-header">
            <div class="header-content">
                <NuxtLink to="/dashboard" class="logo">
                    <span class="logo-text">CutKit</span>
                </NuxtLink>

                <Menubar :model="menuItems" class="main-nav">
                    <template #start>
                        <NuxtLink to="/dashboard" class="logo-mobile">
                            CutKit
                        </NuxtLink>
                    </template>
                    <template #end>
                        <div class="header-actions">
                            <Button 
                                :icon="themeIcon" 
                                text 
                                rounded 
                                @click="toggleTheme"
                                class="theme-toggle"
                            />
                            <LanguageSwitcher />
                            <UserBalance class="balance-display" />
                            <Avatar :label="userInitials" shape="circle" />
                        </div>
                    </template>
                </Menubar>

                <Button 
                    icon="pi pi-bars" 
                    text 
                    @click="toggleMobileMenu"
                    class="mobile-menu-toggle"
                />
            </div>
        </header>

        <Sidebar v-model:visible="mobileMenuVisible" position="left" class="mobile-sidebar">
            <template #header>
                <h3>Menu</h3>
            </template>
            <Menu :model="mobileMenuItems" />
        </Sidebar>

        <main class="dashboard-main">
            <div class="content-wrapper">
                <Breadcrumb :home="breadcrumbHome" :model="breadcrumbItems" class="page-breadcrumb" />
                <slot />
            </div>
        </main>

        <Footer />
        
        <ChatSupport v-if="supportDialog" />
        <Button 
            icon="pi pi-comment" 
            label="Support"
            severity="secondary"
            @click="supportDialog = true"
            v-if="!supportDialog"
            class="support-button"
        />
        
        <BuyCreditsDialog v-model:isModalOpen="buyCreditsDialog" />
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Menubar from 'primevue/menubar';
import Menu from 'primevue/menu';
import Sidebar from 'primevue/sidebar';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Breadcrumb from 'primevue/breadcrumb';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';
import UserBalance from '~/components/UserBalance.vue';
import Footer from '~/components/Footer.vue';
import ChatSupport from '~/components/ChatSupport.vue';
import BuyCreditsDialog from '~/components/BuyCreditsDialog.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const supportDialog = useSupportDialog();
const buyCreditsDialog = useBuyCreditsDialog();

const themeCookie = useCookie('theme');
const currentTheme = computed(() => themeCookie.value || 'light');
const themeIcon = computed(() => currentTheme.value === 'dark' ? 'pi pi-sun' : 'pi pi-moon');

const mobileMenuVisible = ref(false);

// User data (mock for now - should come from auth)
const userInitials = computed(() => 'U');

const toggleTheme = () => {
    themeCookie.value = currentTheme.value === 'dark' ? 'light' : 'dark';
};

const toggleMobileMenu = () => {
    mobileMenuVisible.value = !mobileMenuVisible.value;
};

// Main navigation menu
const menuItems = ref([
    {
        label: computed(() => t('nav.projects')),
        icon: 'pi pi-folder',
        items: [
            {
                label: computed(() => t('nav.allProjects')),
                icon: 'pi pi-list',
                command: () => router.push('/projects')
            },
            {
                label: computed(() => t('nav.newProject')),
                icon: 'pi pi-plus',
                command: () => router.push('/projects/new')
            },
            { separator: true },
            {
                label: computed(() => t('nav.recentProjects')),
                icon: 'pi pi-clock',
                items: [] // Will be populated with recent projects
            }
        ]
    },
    {
        label: computed(() => t('nav.assets')),
        icon: 'pi pi-box',
        items: [
            {
                label: computed(() => t('nav.cassettes')),
                icon: 'pi pi-file',
                command: () => router.push('/assets/cassettes')
            },
            {
                label: computed(() => t('nav.library')),
                icon: 'pi pi-book',
                command: () => router.push('/assets/library')
            }
        ]
    },
    {
        label: computed(() => t('nav.profile')),
        icon: 'pi pi-user',
        items: [
            {
                label: computed(() => t('nav.account')),
                icon: 'pi pi-user-edit',
                command: () => router.push('/profile')
            },
            {
                label: computed(() => t('nav.buyCredits')),
                icon: 'pi pi-wallet',
                command: () => { buyCreditsDialog.value = true; }
            },
            { separator: true },
            {
                label: computed(() => t('nav.logout')),
                icon: 'pi pi-sign-out',
                command: async () => {
                    await $fetch('/api/auth/logout', { method: 'POST' });
                    router.push('/');
                }
            }
        ]
    }
]);

// Mobile menu (flat structure)
const mobileMenuItems = computed(() => [
    {
        label: t('nav.dashboard'),
        icon: 'pi pi-home',
        command: () => {
            router.push('/dashboard');
            mobileMenuVisible.value = false;
        }
    },
    {
        label: t('nav.projects'),
        icon: 'pi pi-folder',
        command: () => {
            router.push('/projects');
            mobileMenuVisible.value = false;
        }
    },
    {
        label: t('nav.cassettes'),
        icon: 'pi pi-file',
        command: () => {
            router.push('/assets/cassettes');
            mobileMenuVisible.value = false;
        }
    },
    {
        label: t('nav.library'),
        icon: 'pi pi-book',
        command: () => {
            router.push('/assets/library');
            mobileMenuVisible.value = false;
        }
    },
    {
        label: t('nav.profile'),
        icon: 'pi pi-user',
        command: () => {
            router.push('/profile');
            mobileMenuVisible.value = false;
        }
    }
]);

// Breadcrumb
const breadcrumbHome = ref({ icon: 'pi pi-home', to: '/dashboard' });
const breadcrumbItems = computed(() => {
    const path = route.path;
    const items = [];
    
    if (path.startsWith('/projects/')) {
        items.push({ label: t('nav.projects'), to: '/projects' });
        if (route.params.slug) {
            items.push({ label: route.params.slug });
        }
    } else if (path.startsWith('/assets/')) {
        items.push({ label: t('nav.assets') });
        if (path.includes('/cassettes')) {
            items.push({ label: t('nav.cassettes') });
        } else if (path.includes('/library')) {
            items.push({ label: t('nav.library') });
        }
    } else if (path === '/profile') {
        items.push({ label: t('nav.profile') });
    }
    
    return items;
});
</script>

<style lang="scss" scoped>
.dashboard-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: var(--surface-ground);
}

.dashboard-header {
    background-color: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);
    position: sticky;
    top: 0;
    z-index: 1000;
    
    .header-content {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 1rem;
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .logo {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--primary-color);
        text-decoration: none;
        margin-right: 2rem;
        
        @media (max-width: 960px) {
            display: none;
        }
    }
    
    .logo-mobile {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--primary-color);
        text-decoration: none;
        
        @media (min-width: 961px) {
            display: none;
        }
    }
    
    .main-nav {
        flex: 1;
        border: none;
        background: transparent;
        
        @media (max-width: 960px) {
            display: none;
        }
    }
    
    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        
        @media (max-width: 960px) {
            display: none;
        }
    }
    
    .mobile-menu-toggle {
        margin-left: auto;
        
        @media (min-width: 961px) {
            display: none;
        }
    }
}

.dashboard-main {
    flex: 1;
    
    .content-wrapper {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1.5rem 1rem;
    }
    
    .page-breadcrumb {
        margin-bottom: 1.5rem;
    }
}

.support-button {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    z-index: 999;
    box-shadow: var(--elevation-4);
}

.balance-display {
    padding: 0.5rem 1rem;
    background: var(--surface-50);
    border-radius: var(--border-radius);
}

:deep(.p-menubar) {
    padding: 0.5rem 0;
}

:deep(.p-breadcrumb) {
    background: transparent;
    border: none;
    padding: 0;
}
</style>
