<template>
    <div class="flex items-center justify-center min-h-screen bg-[var(--p-surface-ground)]">
        <div class="w-full max-w-md p-8 bg-[var(--p-content-background)] rounded-2xl border border-[var(--p-content-border-color)] shadow-xl">
            <div class="flex flex-col items-center gap-2 mb-8">
                <i class="pi pi-box text-4xl text-[var(--p-primary-color)]"></i>
                <h1 class="text-2xl font-black text-[var(--p-text-color)]">CutKit</h1>
                <p class="text-[var(--p-text-muted-color)]">{{ $t('auth.subtitle') }}</p>
            </div>

            <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                    <label for="email" class="font-bold text-sm">{{ $t('profile.email') }}</label>
                    <InputText id="email" v-model="email" type="email" class="w-full" required />
                </div>

                <div class="flex flex-col gap-2">
                    <label for="password" class="font-bold text-sm">{{ $t('profile.password') }}</label>
                    <Password id="password" v-model="password" :feedback="false" toggleMask class="w-full" inputClass="w-full" required />
                </div>

                <Button type="submit" :label="$t('auth.login')" :loading="loading" class="w-full mt-2" />
            </form>

            <div class="mt-6 text-center text-sm">
                <span class="text-[var(--p-text-muted-color)]">{{ $t('auth.noAccount') }} </span>
                <NuxtLink to="/auth/register" class="font-bold text-[var(--p-primary-color)] hover:underline">{{ $t('auth.signup') }}</NuxtLink>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';

definePageMeta({
    layout: 'empty'
});

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const email = ref('');
const password = ref('');
const loading = ref(false);

const handleLogin = async () => {
    loading.value = true;
    try {
        await authStore.login(email.value, password.value);
        router.push('/');
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Login failed', life: 3000 });
    } finally {
        loading.value = false;
    }
};
</script>