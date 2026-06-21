<template>
    <div class="flex min-h-screen items-center justify-center bg-[var(--ck-page-background)] p-4">
        <Panel class="w-full max-w-md">
            <div class="flex flex-col items-center gap-2 mb-8">
                <i class="pi pi-box text-4xl"></i>
                <h1>CutKit</h1>
                <p>{{ $t('auth.createAccount') }}</p>
            </div>

            <form @submit.prevent="handleRegister" class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                    <label for="name">{{ $t('profile.name') }}</label>
                    <InputText id="name" v-model="form.name" class="w-full" required />
                </div>

                <div class="flex flex-col gap-1">
                    <label for="email">{{ $t('profile.email') }}</label>
                    <InputText id="email" v-model="form.email" type="email" class="w-full" required />
                </div>

                <div class="flex flex-col gap-1">
                    <label for="password">{{ $t('profile.password') }}</label>
                    <Password id="password" v-model="form.password" toggleMask class="w-full" inputClass="w-full" required />
                </div>

                <div v-if="invitationToken" class="flex flex-col gap-2">
                    <Message severity="info">{{ $t('auth.invitationSignupNote') }}</Message>
                </div>

                <div v-if="!invitationToken" class="flex flex-col gap-1">
                    <label for="organization-name">{{ $t('auth.organizationName') }}</label>
                    <InputText id="organization-name" v-model="form.organizationName" class="w-full" required />
                </div>

                <div v-if="!invitationToken" class="flex flex-col gap-1">
                    <label for="organization-template">{{ $t('auth.processTemplate') }}</label>
                    <Select 
                        id="organization-template"
                        v-model="form.processTemplateId"
                        :options="processTemplateOptions"
                        optionLabel="label"
                        optionValue="value"
                        class="w-full"
                    />
                </div>

                <Button type="submit" :label="$t('auth.signup')" :loading="loading" class="w-full mt-2" />
            </form>

            <div class="mt-6 text-center">
                <span>{{ $t('auth.hasAccount') }} </span>
                <NuxtLink :to="loginTarget">{{ $t('auth.login') }}</NuxtLink>
            </div>
        </Panel>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Panel from 'primevue/panel';
import Message from 'primevue/message';

definePageMeta({
    layout: 'empty'
});

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();

const form = ref({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    processTemplateId: 'contractor'
});

const loading = ref(false);
const invitationToken = computed(() => {
    const value = route.query.invitation;
    return Array.isArray(value) ? value[0] : value || '';
});
const redirectPath = computed(() => normalizeRedirect(route.query.redirect));
const loginTarget = computed(() => ({
    path: '/auth/login',
    query: {
        ...(redirectPath.value ? { redirect: redirectPath.value } : {}),
        ...(invitationToken.value ? { invitation: invitationToken.value } : {})
    }
}));
const processTemplateOptions = computed(() => ([
    { label: t('auth.processTemplates.contractor'), value: 'contractor' },
    { label: t('auth.processTemplates.manufacturer'), value: 'manufacturer' },
    { label: t('auth.processTemplates.customer'), value: 'customer' },
    { label: t('auth.processTemplates.serviceProvider'), value: 'serviceProvider' }
]));

const handleRegister = async () => {
    loading.value = true;
    try {
        const payload = invitationToken.value
            ? {
                name: form.value.name,
                email: form.value.email,
                password: form.value.password
            }
            : form.value;
        await authStore.register(payload);
        toast.add({ severity: 'success', summary: t('auth.welcome'), detail: t('auth.accountCreatedSuccessfully'), life: 3000 });
        router.push(loginTarget.value);
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('auth.registrationFailed'), life: 3000 });
    } finally {
        loading.value = false;
    }
};

function normalizeRedirect(value) {
    const candidate = Array.isArray(value) ? value[0] : value;
    return typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//')
        ? candidate
        : '';
}
</script>
