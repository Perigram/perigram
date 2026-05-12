<template>
    <div class="flex flex-col gap-6 p-6">
        <h1 class="text-2xl font-bold">{{ $t('admin.systemDiagnostics') }}</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Current User State -->
            <Card>
                <template #title>{{ $t('admin.currentUserContext') }}</template>
                <template #content>
                    <div class="flex flex-col gap-2 text-sm">
                        <div class="grid grid-cols-2">
                            <span class="opacity-60">{{ $t('admin.userId') }}:</span>
                            <span class="font-mono">{{ authStore.userData?.id }}</span>
                        </div>
                        <div class="grid grid-cols-2">
                            <span class="opacity-60">{{ $t('billing.role') }}:</span>
                            <span class="font-bold text-primary">{{ authStore.userData?.role }}</span>
                        </div>
                        <div class="grid grid-cols-2">
                            <span class="opacity-60">{{ $t('admin.organizationType') }}:</span>
                            <span>{{ authStore.organizationData?.type || $t('common.notAvailable') }}</span>
                        </div>
                    </div>
                </template>
            </Card>

            <!-- Effective UI Permissions -->
            <Card>
                <template #title>{{ $t('admin.effectiveUiPermissions') }}</template>
                <template #content>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="text-left opacity-60 text-[10px] uppercase font-black">
                                    <th class="pb-2">{{ $t('admin.feature') }}</th>
                                    <th class="pb-2">{{ $t('admin.action') }}</th>
                                    <th class="pb-2 text-right">{{ $t('admin.allowed') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <template v-for="(actions, feature) in myPermissions" :key="feature">
                                    <tr v-for="(allowed, action) in actions" :key="action" class="border-t border-[var(--p-content-border-color)]">
                                        <td class="py-1 font-mono text-xs">{{ feature }}</td>
                                        <td class="py-1">{{ action }}</td>
                                        <td class="py-1 text-right">
                                            <Tag :severity="allowed ? 'success' : 'danger'" :value="allowed ? $t('common.yes') : $t('common.no')" size="small" />
                                        </td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                    </div>
                </template>
            </Card>
        </div>

        <!-- Full Matrix Reference -->
        <Panel :header="$t('admin.globalPermissionMatrix')" toggleable collapsed>
            <pre class="text-[10px] font-mono bg-[var(--p-surface-100)] p-4 rounded-xl overflow-auto border border-[var(--p-content-border-color)]">{{ UI_PERMISSIONS }}</pre>
        </Panel>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { UI_PERMISSIONS, resolveUiPermission } from '~/shared/ui-permissions';
import Tag from 'primevue/tag';

definePageMeta({
    layout: 'app',
    middleware: ['auth'] // In real app, restrict to admins or dev mode
});

const authStore = useAuthStore();

const myPermissions = computed(() => {
    const role = authStore.userData?.role;
    if (!role) return {};
    
    // Flatten the matrix for this role to show what they have
    const matrix = UI_PERMISSIONS[role] || {};
    const result = {};
    
    for (const [feature, actions] of Object.entries(matrix)) {
        result[feature] = {};
        for (const [action, value] of Object.entries(actions)) {
            result[feature][action] = resolveUiPermission(role, feature, action);
        }
    }
    return result;
});
</script>
