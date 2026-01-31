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
                        :options="organizations" 
                        optionLabel="name" 
                        optionValue="_id" 
                        placeholder="Select organization"
                        class="w-full"
                        :loading="loadingOrgs"
                    />
                    <small>
                        Or <a href="#" @click.prevent="showCreateOrg = true">create new organization</a>
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
        <Dialog v-model:visible="showCreateOrg" :header="$t('auth.createOrg')" modal>
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>Organization Name</label>
                    <InputText v-model="newOrg.name" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                    <label>Type</label>
                    <Select 
                        v-model="newOrg.type" 
                        :options="['Manufacturer', 'Contractor', 'Customer']" 
                        class="w-full" 
                    />
                </div>
            </div>
            <template #footer>
                <Button label="Cancel" text severity="secondary" @click="showCreateOrg = false" />
                <Button label="Create" @click="createOrganization" :loading="creatingOrg" />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';

definePageMeta({
    layout: 'empty'
});

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

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

onMounted(async () => {
    loadingOrgs.value = true;
    try {
        // TODO: This endpoint needs to be public or we need a way to list orgs for registration
        // For now assuming we have a public endpoint or we use a temporary solution
        const res = await $fetch('/api/organizations');
        organizations.value = res;
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
        const org = await $fetch('/api/organizations', {
            method: 'POST',
            body: newOrg.value
        });
        organizations.value.push(org);
        form.value.organizationId = org._id;
        showCreateOrg.value = false;
        toast.add({ severity: 'success', summary: 'Success', detail: 'Organization created', life: 3000 });
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create organization', life: 3000 });
    } finally {
        creatingOrg.value = false;
    }
};

const handleRegister = async () => {
    loading.value = true;
    try {
        await authStore.register(form.value);
        toast.add({ severity: 'success', summary: 'Welcome!', detail: 'Account created successfully', life: 3000 });
        router.push('/auth/login');
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Registration failed', life: 3000 });
    } finally {
        loading.value = false;
    }
};
</script>