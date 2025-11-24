<template>
    <div class="project-layout">
        <header class="project-header">
            <div class="header-content">
                <NuxtLink to="/dashboard" class="back-button">
                    <i class="pi pi-arrow-left"></i>
                </NuxtLink>
                
                <div class="project-info">
                    <h1 class="project-name">{{ projectName }}</h1>
                    <Breadcrumb :home="breadcrumbHome" :model="breadcrumbItems" />
                </div>
                
                <div class="header-actions">
                    <Button 
                        :icon="themeIcon" 
                        text 
                        rounded 
                        @click="toggleTheme"
                        class="theme-toggle"
                    />
                    <UserBalance />
                    <Avatar :label="userInitials" shape="circle" />
                </div>
            </div>
        </header>

        <div class="project-content">
            <aside class="project-sidebar">
                <Menu :model="sidebarItems" class="project-menu" />
            </aside>

            <main class="project-main">
                <slot />
            </main>
        </div>

        <Toast />
        <ConfirmDialog />
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
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Menu from 'primevue/menu';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Breadcrumb from 'primevue/breadcrumb';
import UserBalance from '~/components/UserBalance.vue';
import Footer from '~/components/Footer.vue';
import ChatSupport from '~/components/ChatSupport.vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const supportDialog = useSupportDialog();

const themeCookie = useCookie('theme');
const currentTheme = computed(() => themeCookie.value || 'light');
const themeIcon = computed(() => currentTheme.value === 'dark' ? 'pi pi-sun' : 'pi pi-moon');

const userInitials = computed(() => 'U');

const projectSlug = computed(() => route.params.slug);
const projectName = computed(() => {
    // This should come from project data
    return route.params.slug || 'Project';
});

const toggleTheme = () => {
    themeCookie.value = currentTheme.value === 'dark' ? 'light' : 'dark';
};

// Sidebar navigation
const sidebarItems = computed(() => {
    const slug = projectSlug.value;
    const currentPath = route.path;
    
    return [
        {
            label: t('project.batches'),
            icon: 'pi pi-table',
            command: () => router.push(`/project/${slug}/batches`),
            class: currentPath.includes('/batches') ? 'active-item' : ''
        },
        {
            label: t('project.artifacts'),
            icon: 'pi pi-file-excel',
            command: () => router.push(`/project/${slug}/artifacts`),
            class: currentPath.includes('/artifacts') ? 'active-item' : ''
        },
        {
            label: t('project.files'),
            icon: 'pi pi-file',
            command: () => router.push(`/project/${slug}/files`),
            class: currentPath.includes('/files') ? 'active-item' : ''
        },
        {
            separator: true
        },
        {
            label: t('project.settings'),
            icon: 'pi pi-cog',
            command: () => router.push(`/project/${slug}/settings`),
            class: currentPath.includes('/settings') ? 'active-item' : ''
        }
    ];
});

// Breadcrumb
const breadcrumbHome = ref({ icon: 'pi pi-home', to: '/dashboard' });
const breadcrumbItems = computed(() => [
    { label: t('nav.projects'), to: '/projects' },
    { label: projectName.value }
]);
</script>

<style lang="scss" scoped>
.project-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: var(--surface-ground);
}

.project-header {
    background-color: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);
    position: sticky;
    top: 0;
    z-index: 1000;
    
    .header-content {
        max-width: 1600px;
        margin: 0 auto;
        padding: 1rem 1.5rem;
        display: flex;
        align-items: center;
        gap: 1.5rem;
    }
    
    .back-button {
        color: var(--text-color);
        font-size: 1.25rem;
        transition: color 0.2s;
        
        &:hover {
            color: var(--primary-color);
        }
    }
    
    .project-info {
        flex: 1;
        min-width: 0;
        
        .project-name {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0 0 0.25rem 0;
            color: var(--text-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }
    
    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
}

.project-content {
    display: flex;
    flex: 1;
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
}

.project-sidebar {
    width: 240px;
    background-color: var(--surface-card);
    border-right: 1px solid var(--surface-border);
    padding: 1.5rem 0;
    position: sticky;
    top: 80px;
    height: calc(100vh - 80px);
    overflow-y: auto;
    
    @media (max-width: 960px) {
        display: none;
    }
    
    .project-menu {
        border: none;
        background: transparent;
        width: 100%;
    }
}

.project-main {
    flex: 1;
    padding: 1.5rem;
    min-width: 0;
}

.support-button {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    z-index: 999;
    box-shadow: var(--elevation-4);
}

:deep(.p-breadcrumb) {
    background: transparent;
    border: none;
    padding: 0;
    font-size: 0.875rem;
}

:deep(.p-menu) {
    .p-menuitem-link {
        padding: 0.75rem 1.5rem;
        
        &:hover {
            background-color: var(--surface-hover);
        }
    }
    
    .active-item .p-menuitem-link {
        background-color: var(--primary-color);
        color: var(--primary-color-text);
        
        .p-menuitem-icon {
            color: var(--primary-color-text);
        }
    }
}
</style>
