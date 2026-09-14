<template>
    <div class="min-h-screen flex items-center justify-center bg-page p-4">
        <Panel
            class="w-full max-w-md overflow-hidden"
            :pt="{ header: { class: 'hidden' } }"
        >
            <div class="mb-6 flex flex-col items-center gap-3 text-center">
                <span class="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-contrast">
                    <i class="pi pi-building" aria-hidden="true"></i>
                </span>
                <h1 class="m-0 text-page-title">{{ $t('auth.invitationTitle') }}</h1>
            </div>
            <StateBlock v-if="loading" state="loading" :message="$t('auth.fetchingInvitation')" />
            
            <div v-else-if="error" class="flex min-w-0 flex-col gap-4 py-8 text-center">
                <Message severity="error" class="w-full min-w-0 [&_.p-message-text]:break-words">{{ error }}</Message>
                <Button :label="$t('errors.goHome')" @click="navigateTo('/')" />
            </div>

            <div v-else-if="invitation" class="flex flex-col gap-6 py-4">
                <div class="flex flex-col items-center gap-3 text-center">
                    <small>{{ $t('auth.invitedToJoin') }}</small>
                    <h2 class="m-0">{{ invitation.organizationName }}</h2>
                    <div class="mt-4 inline-flex items-center gap-2">
                        <i class="pi pi-shield"></i>
                        <Tag :value="invitation.roleLabels?.join(', ')" />
                    </div>
                </div>

                <div class="flex flex-col gap-3">
                    <template v-if="authStore.userIsSet">
                        <Button 
                            :label="$t('auth.joinOrganization')"
                            icon="pi pi-user-plus" 
                            class="w-full" 
                            :loading="joining"
                            @click="joinHandler" 
                        />
                    </template>
                    <template v-else>
                        <Button 
                            :label="$t('auth.loginToJoin')"
                            icon="pi pi-sign-in" 
                            class="w-full" 
                            @click="navigateTo(loginTarget)" 
                        />
                        <Button 
                            :label="$t('auth.registerToJoin')"
                            icon="pi pi-user-plus" 
                            severity="secondary"
                            outlined
                            class="w-full" 
                            @click="navigateTo(registerTarget)" 
                        />
                        <p class="text-center">
                            <small>{{ $t('auth.loginRequiredForInvitation') }}</small>
                        </p>
                    </template>
                    <Button 
                        :label="$t('common.cancel')"
                        severity="secondary" 
                        text 
                        class="w-full" 
                        :disabled="joining"
                        @click="navigateTo('/')"
                    />
                </div>
            </div>
        </Panel>
    </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
    layout: false
});

const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const { t } = useI18n();
const token = route.params.token;

const invitation = ref(null);
const loading = ref(true);
const error = ref(null);
const joining = ref(false);
const loginTarget = computed(() => ({
    path: '/auth/login',
    query: { redirect: route.fullPath }
}));
const registerTarget = computed(() => ({
    path: '/auth/register',
    query: { invitation: token, redirect: route.fullPath }
}));

const fetchInvitation = async () => {
    loading.value = true;
    try {
        invitation.value = await $fetch(`/api/invitations/${token}`);
    } catch (err) {
        const status = err?.statusCode || err?.status || err?.response?.status;
        error.value = status === 404 || status === 410
            ? t('auth.invitationUnavailable')
            : t('errors.loadFailed');
    } finally {
        loading.value = false;
    }
};

const joinHandler = async () => {
    joining.value = true;
    try {
        await $fetch(`/api/invitations/${token}/join`, { method: 'POST' });
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.organizationJoined'), life: 3000 });
        navigateTo('/profile');
    } catch (err) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: err.message, life: 3000 });
    } finally {
        joining.value = false;
    }
};

onMounted(fetchInvitation);
</script>
