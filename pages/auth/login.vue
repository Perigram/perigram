<template>
    <div class="flex min-h-screen items-center justify-center bg-[var(--ck-page-background)] p-4">
        <Panel class="w-full max-w-md">
            <div class="flex flex-col items-center gap-2 mb-8">
                <i class="pi pi-box text-4xl"></i>
                <h1>CutKit</h1>
                <p>{{ $t('auth.subtitle') }}</p>
            </div>

            <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                    <label for="email">{{ $t('profile.email') }}</label>
                    <InputText id="email" v-model="email" type="email" class="w-full" required />
                </div>

                <div class="flex flex-col gap-1">
                    <label for="password">{{ $t('profile.password') }}</label>
                    <Password id="password" v-model="password" :feedback="false" toggleMask class="w-full" inputClass="w-full" required />
                </div>

                <Button type="submit" :label="$t('auth.login')" :loading="loading" class="w-full mt-2" />
            </form>

            <div class="mt-6 text-center">
                <span>{{ $t('auth.noAccount') }} </span>
                <NuxtLink to="/auth/register">{{ $t('auth.signup') }}</NuxtLink>
            </div>
        </Panel>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Panel from 'primevue/panel';

definePageMeta({
    layout: 'empty'
});

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();

const email = ref('');
const password = ref('');
const loading = ref(false);

const handleLogin = async () => {
    loading.value = true;
    try {
        await authStore.login(email.value, password.value);
        router.push('/');
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('auth.loginFailed'), life: 3000 });
    } finally {
        loading.value = false;
    }
};
</script>
