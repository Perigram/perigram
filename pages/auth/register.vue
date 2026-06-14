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

                <div class="flex flex-col gap-1">
                    <label for="organization-name">{{ $t('auth.organizationName') }}</label>
                    <InputText id="organization-name" v-model="form.organizationName" class="w-full" required />
                </div>

                <div class="flex flex-col gap-1">
                    <label for="organization-type">{{ $t('auth.organizationType') }}</label>
                    <Select 
                        id="organization-type"
                        v-model="form.organizationType"
                        :options="orgTypeOptions"
                        optionLabel="label"
                        optionValue="value"
                        class="w-full"
                    />
                </div>

                <Button type="submit" :label="$t('auth.signup')" :loading="loading" class="w-full mt-2" />
            </form>

            <div class="mt-6 text-center">
                <span>{{ $t('auth.hasAccount') }} </span>
                <NuxtLink to="/auth/login">{{ $t('auth.login') }}</NuxtLink>
            </div>
        </Panel>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Panel from 'primevue/panel';

definePageMeta({
    layout: 'empty'
});

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();

const form = ref({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    organizationType: 'Contractor'
});

const loading = ref(false);
const orgTypeOptions = computed(() => ([
    { label: t('auth.orgTypes.manufacturer'), value: 'Manufacturer' },
    { label: t('auth.orgTypes.contractor'), value: 'Contractor' },
    { label: t('auth.orgTypes.customer'), value: 'Customer' }
]));

const handleRegister = async () => {
    loading.value = true;
    try {
        await authStore.register(form.value);
        toast.add({ severity: 'success', summary: t('auth.welcome'), detail: t('auth.accountCreatedSuccessfully'), life: 3000 });
        router.push('/auth/login');
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('auth.registrationFailed'), life: 3000 });
    } finally {
        loading.value = false;
    }
};
</script>
