<template>
    <div class="flex min-h-screen items-center justify-center bg-page p-4">
        <Panel class="w-full max-w-md">
            <div class="flex flex-col items-center gap-2 mb-8">
                <NuxtLink to="/" class="flex items-center no-underline" aria-label="Perigram">
                    <img src="/logo-light.svg" alt="Perigram" class="h-7 w-auto dark:hidden" />
                    <img src="/logo-dark.svg" alt="Perigram" class="hidden h-7 w-auto dark:block" />
                </NuxtLink>
                <p class="m-0">{{ $t('auth.subtitle') }}</p>
            </div>

            <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                    <label for="email">{{ $t('profile.email') }}</label>
                    <InputText id="email" v-model="email" type="email" class="w-full" required autocomplete="email" />
                </div>

                <div class="flex flex-col gap-1">
                    <label for="password">{{ $t('profile.password') }}</label>
                    <Password id="password" v-model="password" :feedback="false" toggleMask class="w-full" inputClass="w-full" required autocomplete="current-password" />
                </div>

                <Message v-if="formError" severity="error" data-testid="login-error">{{ formError }}</Message>

                <Button type="submit" :label="redirecting ? $t('auth.redirecting') : $t('auth.login')" :loading="loading || redirecting" class="w-full mt-2" />
            </form>

            <div class="mt-6 text-center">
                <span>{{ $t('auth.noAccount') }} </span>
                <NuxtLink :to="registerTarget">{{ $t('auth.signup') }}</NuxtLink>
            </div>
        </Panel>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
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

const email = ref('');
const password = ref('');
const loading = ref(false);
const redirecting = ref(false);
const formError = ref('');
const redirectPath = computed(() => normalizeRedirect(route.query.redirect));
const registerTarget = computed(() => ({
    path: '/auth/register',
    query: {
        ...(redirectPath.value ? { redirect: redirectPath.value } : {}),
        ...(route.query.invitation ? { invitation: route.query.invitation } : {})
    }
}));

const handleLogin = async () => {
    loading.value = true;
    formError.value = '';
    try {
        await authStore.login(email.value, password.value);
        redirecting.value = true;
        router.push(redirectPath.value || '/');
    } catch (error) {
        formError.value = t('auth.loginFailed');
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
