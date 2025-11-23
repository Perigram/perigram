<template>
    <div class="app-layout">
        <header class="app-header">
            <div class="header-content">
                <!-- Logo -->
                <NuxtLink to="/projects" class="logo">
                    <i class="pi pi-th-large logo-icon"></i>
                    <span class="logo-text">CutKit</span>
                </NuxtLink>

                <!-- Breadcrumbs -->
                <div class="breadcrumbs">
                    <NuxtLink to="/projects" class="breadcrumb-item" :class="{ active: isProjectsPage }">
                        {{ $t('projects.title') }}
                    </NuxtLink>
                    <template v-if="currentProject">
                        <i class="pi pi-chevron-right separator"></i>
                        <span class="breadcrumb-item active">{{ currentProject.name }}</span>
                    </template>
                </div>

                <div class="spacer"></div>

                <!-- Right side actions -->
                <div class="header-actions">
                    <Button 
                        :label="$t('navigation.assets')"
                        text
                        :class="{ 'active-nav': isAssetsPage }"
                        @click="navigateTo('/assets')"
                    />
                    
                    <Button 
                        :icon="themeIcon" 
                        text 
                        rounded 
                        severity="secondary"
                        @click="toggleTheme"
                        v-tooltip.bottom="$t('common.toggleTheme')"
                    />
                    
                    <div class="balance-chip">
                        <i class="pi pi-wallet"></i>
                        <UserBalance />
                    </div>
                    
                    <Button 
                        icon="pi pi-user"
                        :label="userInitials"
                        text
                        rounded
                        @click="toggleProfileMenu"
                        aria-haspopup="true"
                        aria-controls="profile_menu"
                    />
                    <Menu ref="profileMenu" id="profile_menu" :model="profileMenuItems" :popup="true" />
                </div>
            </div>
        </header>

        <main class="app-main">
            <slot />
        </main>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useColorMode } from '@vueuse/core';
import Menubar from 'primevue/menubar';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import UserBalance from '~/components/UserBalance.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';

const router = useRouter();
const route = useRoute();
const { $i18n } = useNuxtApp();

const mode = useColorMode();
const profileMenu = ref();
const currentProject = ref(null);

const themeIcon = computed(() => mode.value === 'dark' ? 'pi pi-sun' : 'pi pi-moon');
const userInitials = computed(() => 'U'); // TODO: Get from auth

const isProjectsPage = computed(() => route.path === '/projects' || route.path === '/');
const isAssetsPage = computed(() => route.path.startsWith('/assets'));

// Load current project if in project context
onMounted(async () => {
    if (route.params.slug) {
        try {
            currentProject.value = await $fetch(`/api/project/${route.params.slug}`);
        } catch (error) {
            console.error('Failed to load project:', error);
        }
    }
});

// Watch route changes to update project
watch(() => route.params.slug, async (newSlug) => {
    if (newSlug) {
        try {
            currentProject.value = await $fetch(`/api/project/${newSlug}`);
        } catch (error) {
            console.error('Failed to load project:', error);
        }
    } else {
        currentProject.value = null;
    }
});

const toggleTheme = () => {
    mode.value = mode.value === 'dark' ? 'light' : 'dark';
};

const toggleProfileMenu = (event) => {
    profileMenu.value.toggle(event);
};

const profileMenuItems = computed(() => [
    {
        label: $i18n.t('profile.title'),
        icon: 'pi pi-user',
        command: () => router.push('/profile')
    },
    {
        separator: true
    },
    {
        label: $i18n.t('auth.logout'),
        icon: 'pi pi-sign-out',
        command: () => router.push('/auth/logout')
    }
]);
</script>

<style scoped lang="scss">
.app-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--surface-ground);
}

.app-header {
    background: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);
    position: sticky;
    top: 0;
    z-index: 1000;
    
    .header-content {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        padding: 0.75rem 1.5rem;
        max-width: 1600px;
        margin: 0 auto;
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
    
    .logo-icon {
        font-size: 1.5rem;
    }
    
    &:hover {
        opacity: 0.8;
    }
}

.breadcrumbs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    
    .breadcrumb-item {
        color: var(--text-color-secondary);
        text-decoration: none;
        transition: color 0.2s;
        
        &:hover:not(.active) {
            color: var(--primary-color);
        }
        
        &.active {
            color: var(--text-color);
            font-weight: 600;
        }
    }
    
    .separator {
        font-size: 0.75rem;
        color: var(--text-color-secondary);
    }
}

.spacer {
    flex: 1;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    
    .active-nav {
        background: var(--primary-color);
        color: white;
        
        &:hover {
            background: var(--primary-color);
            opacity: 0.9;
        }
    }
}

.balance-chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--surface-100);
    border-radius: var(--border-radius);
    font-size: 0.9rem;
    
    i {
        color: var(--primary-color);
    }
}

.app-main {
    flex: 1;
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem;
}
</style>
