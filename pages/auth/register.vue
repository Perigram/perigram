<template>
    <div class="flex min-h-screen items-center justify-center bg-page p-4">
        <Panel class="w-full max-w-md">
            <div class="flex flex-col items-center gap-2 mb-8">
                <NuxtLink to="/" class="flex items-center no-underline" aria-label="Perigram">
                    <img src="/logo-light.svg" alt="Perigram" class="h-7 w-auto dark:hidden" />
                    <img src="/logo-dark.svg" alt="Perigram" class="hidden h-7 w-auto dark:block" />
                </NuxtLink>
                <p class="m-0">{{ $t('auth.createAccount') }}</p>
            </div>

            <div v-if="succeeded" class="flex flex-col items-center gap-4 py-6" data-testid="register-success">
                <Message severity="success">{{ $t('auth.accountCreatedSuccessfully') }}</Message>
                <Button :label="$t('auth.login')" icon="pi pi-sign-in" @click="router.push(loginTarget)" />
            </div>

            <form v-else @submit.prevent="handleRegister" class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                    <label for="name">{{ $t('profile.name') }}</label>
                    <InputText id="name" v-model="form.name" class="w-full" required autocomplete="name" />
                </div>

                <div class="flex flex-col gap-1">
                    <label for="email">{{ $t('profile.email') }}</label>
                    <InputText id="email" v-model="form.email" type="email" class="w-full" required autocomplete="email" />
                </div>

                <div class="flex flex-col gap-1">
                    <label for="password">{{ $t('profile.password') }}</label>
                    <Password id="password" v-model="form.password" toggleMask class="w-full" inputClass="w-full" required autocomplete="new-password" />
                </div>

                <Message v-if="invitationToken" severity="info">{{ $t('auth.invitationSignupNote') }}</Message>
                <Message v-if="formError" severity="error" data-testid="register-error">{{ formError }}</Message>

                <Button type="submit" :label="$t('auth.signup')" :loading="loading" class="w-full mt-2" />
            </form>

            <div v-if="!succeeded" class="mt-6 text-center">
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
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Message from 'primevue/message';

definePageMeta({
    layout: 'empty'
});

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { t } = useI18n();

const form = ref({
    name: '',
    email: '',
    password: ''
});

const loading = ref(false);
const succeeded = ref(false);
const formError = ref('');
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

const handleRegister = async () => {
    loading.value = true;
    formError.value = '';
    try {
        await authStore.register({
            name: form.value.name,
            email: form.value.email,
            password: form.value.password
        });
        succeeded.value = true;
    } catch (error) {
        formError.value = error?.statusCode === 409 || error?.status === 409
            ? t('auth.emailAlreadyRegistered')
            : t('auth.registrationFailed');
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
