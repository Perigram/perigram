<template>
    <div class="min-h-screen flex items-center justify-center p-4">
        <Card class="w-full max-w-md border">
            <template #title>
                <div class="flex flex-col items-center gap-4 text-center">
                    <div class="w-16 h-16 border rounded-full flex items-center justify-center">
                        <i class="pi pi-building text-3xl"></i>
                    </div>
                    <h1 class="m-0">{{ $t('auth.invitationTitle') }}</h1>
                </div>
            </template>
            <template #content>
                <div v-if="loading" class="flex flex-col items-center py-12 gap-4">
                    <ProgressSpinner />
                    <p>{{ $t('auth.fetchingInvitation') }}</p>
                </div>
                
                <div v-else-if="error" class="text-center py-8 flex flex-col gap-4">
                    <Message severity="error">{{ error }}</Message>
                    <Button :label="$t('errors.goHome')" @click="navigateTo('/')" text />
                </div>

                <div v-else-if="invitation" class="flex flex-col gap-6 py-4">
                    <div class="p-6 border rounded text-center">
                        <small>{{ $t('auth.invitedToJoin') }}</small>
                        <h2 class="m-0">{{ invitation.organizationName }}</h2>
                        <div class="mt-4 inline-flex items-center gap-2">
                            <i class="pi pi-shield"></i>
                            <Tag :value="invitation.role" />
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
                                @click="navigateTo('/')" 
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
            </template>
        </Card>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';

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

const fetchInvitation = async () => {
    loading.value = true;
    try {
        invitation.value = await $fetch(`/api/invitations/${token}`);
    } catch (err) {
        error.value = err.message || t('errors.loadFailed');
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
