<template>
    <div class="flex items-center justify-center min-h-screen">
        <div class="w-full max-w-md p-8 border rounded">
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
                    <label for="org">{{ $t('auth.organization') }}</label>
                    <Select 
                        id="org"
                        v-model="form.organizationId" 
                        :options="organizationOptions"
                        optionLabel="name" 
                        optionValue="_id" 
                        :placeholder="$t('auth.organization')"
                        class="w-full"
                        :loading="loadingOrgs"
                    />
                    <small>
                        {{ $t('auth.or') }}
                        <a href="#" @click.prevent="showCreateOrg = true">{{ $t('auth.createOrg') }}</a>
                    </small>
                </div>

                <Button type="submit" :label="$t('auth.signup')" :loading="loading" class="w-full mt-2" />
            </form>

            <div class="mt-6 text-center">
                <span>{{ $t('auth.hasAccount') }} </span>
                <NuxtLink to="/auth/login">{{ $t('auth.login') }}</NuxtLink>
            </div>
        </div>

        <!-- Create Organization Dialog -->
        <StandardDialog v-model:visible="showCreateOrg" :header="$t('auth.createOrg')" size="sm">
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.name') }}</label>
                    <InputText v-model="newOrg.name" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.type') }}</label>
                    <Select 
                        v-model="newOrg.type" 
                        :options="orgTypeOptions"
                        optionLabel="label"
                        optionValue="value"
                        class="w-full" 
                    />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showCreateOrg = false" />
                <Button :label="$t('common.create')" @click="createOrganization" :loading="creatingOrg" />
            </template>
        </StandardDialog>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Select from 'primevue/select';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useEntity } from '~/composables/useEntity';
import { namedSelectOptions } from '~/utils/selectOptions';

definePageMeta({
    layout: 'empty'
});

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();
const organizationsEntity = useEntity('organization');

const form = ref({
    name: '',
    email: '',
    password: '',
    organizationId: null
});

const organizations = ref([]);
const loading = ref(false);
const loadingOrgs = ref(false);
const showCreateOrg = ref(false);
const creatingOrg = ref(false);
const newOrg = ref({ name: '', type: 'Contractor' });
const orgTypeOptions = computed(() => ([
    { label: t('auth.orgTypes.manufacturer'), value: 'Manufacturer' },
    { label: t('auth.orgTypes.contractor'), value: 'Contractor' },
    { label: t('auth.orgTypes.customer'), value: 'Customer' }
]));
const organizationOptions = computed(() => namedSelectOptions(organizations.value, t('auth.organization')));

onMounted(async () => {
    loadingOrgs.value = true;
    try {
        // TODO: This endpoint needs to be public or we need a way to list orgs for registration
        // For now assuming we have a public endpoint or we use a temporary solution
        organizations.value = await organizationsEntity.list();
    } catch (e) {
        // Fallback or empty
    } finally {
        loadingOrgs.value = false;
    }
});

const createOrganization = async () => {
    creatingOrg.value = true;
    try {
        // We need a public endpoint for this or handle it differently
        // For now, let's assume we can create it
        const org = await organizationsEntity.create(newOrg.value);
        organizations.value.push(org);
        form.value.organizationId = org._id;
        showCreateOrg.value = false;
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.organizationCreated'), life: 3000 });
    } catch (e) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('auth.organizationCreateFailed'), life: 3000 });
    } finally {
        creatingOrg.value = false;
    }
};

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
