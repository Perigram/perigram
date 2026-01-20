<template>
    <div class="flex flex-col gap-6">
        <h1 class="text-2xl font-bold text-[var(--p-text-color)] px-1">{{ $t('nav.profile') }}</h1>
        
        <TabView>
            <TabPanel :header="$t('profile.account')">
                <div class="grid grid-cols-1 md:grid-cols-12 gap-6 py-4">
                    <div class="md:col-span-4">
                        <Card class="h-full border border-[var(--p-content-border-color)]">
                            <template #title>
                                <span class="text-lg font-bold">{{ $t('profile.title') }}</span>
                            </template>
                            <template #content>
                                <div class="flex flex-col items-center text-center gap-4 py-4">
                                    <Avatar :label="user.name ? user.name[0].toUpperCase() : 'U'" size="xlarge" shape="circle" class="bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] w-20 h-20 text-2xl" />
                                    <div class="flex flex-col gap-1">
                                        <p class="text-xl font-bold m-0 text-[var(--p-text-color)]">{{ user.name }}</p>
                                        <p class="text-sm text-[var(--p-text-muted-color)] m-0">{{ user.email }}</p>
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </div>
                    <div class="md:col-span-8">
                        <Card class="h-full border border-[var(--p-content-border-color)]">
                            <template #title>
                                <span class="text-lg font-bold">{{ $t('profile.authentication') }}</span>
                            </template>
                            <template #content>
                                <div class="flex flex-col gap-6 py-2">
                                    <div class="mt-auto">
                                        <Button :label="$t('nav.logout')" icon="pi pi-sign-out" severity="danger" outlined @click="logoutHandler" />
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>

            <TabPanel :header="$t('profile.billing')">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
                    <Card class="border border-[var(--p-content-border-color)] shadow-sm">
                        <template #title>
                            <span class="text-lg font-bold">{{ $t('billing.creditBalance') }}</span>
                        </template>
                        <template #content>
                            <div class="flex flex-col gap-6 py-2">
                                <div class="flex justify-between items-center bg-[var(--p-content-background)] p-6 rounded-xl border border-[var(--p-content-border-color)]">
                                    <div class="flex flex-col gap-1">
                                        <span class="text-sm text-[var(--p-text-muted-color)] uppercase tracking-wider font-bold">{{ $t('profile.balance') }}</span>
                                        <span class="text-4xl font-black text-[var(--p-primary-color)]">{{ user.balance || 0 }}</span>
                                    </div>
                                    <Button :label="$t('profile.buyCredits')" icon="pi pi-shopping-cart" size="large" @click="showBuyCredits = true" />
                                </div>
                                <div class="pt-4 border-t border-[var(--p-content-border-color)]">
                                    <p class="text-xs text-[var(--p-text-muted-color)] mb-3 uppercase font-bold tracking-tighter">Developer Tools</p>
                                    <Button :label="$t('billing.addTestCredits')" icon="pi pi-plus" severity="secondary" text @click="addCredits" />
                                </div>
                            </div>
                        </template>
                    </Card>
                    
                    <Card class="border border-[var(--p-content-border-color)] shadow-sm">
                        <template #title>
                            <span class="text-lg font-bold">{{ $t('billing.purchaseHistory') }}</span>
                        </template>
                        <template #content>
                            <div class="flex flex-col items-center justify-center py-12 text-center gap-4 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl opacity-60">
                                <i class="pi pi-history text-4xl text-[var(--p-text-muted-color)]"></i>
                                <p class="m-0 text-[var(--p-text-secondary-color)] font-medium">{{ $t('billing.noHistory') }}</p>
                            </div>
                        </template>
                    </Card>
                </div>
            </TabPanel>

            <TabPanel :header="$t('profile.preferences')">
                <div class="max-w-2xl py-4">
                    <Card class="border border-[var(--p-content-border-color)]">
                        <template #title>
                            <span class="text-lg font-bold">{{ $t('profile.settings') }}</span>
                        </template>
                        <template #content>
                            <div class="flex flex-col gap-8 py-2">
                                <div class="flex flex-col gap-3">
                                    <label class="font-bold text-sm uppercase tracking-wider text-[var(--p-text-muted-color)]">{{ $t('profile.theme') }}</label>
                                    <div class="flex items-center gap-3 p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-lg">
                                        <i class="pi pi-palette text-xl opacity-50"></i>
                                        <p class="m-0 text-[var(--p-text-color)]">{{ $t('profile.themeNotImplemented') }}</p>
                                    </div>
                                </div>
                                
                                <div class="flex flex-col gap-3">
                                    <label for="language-select" class="font-bold text-sm uppercase tracking-wider text-[var(--p-text-muted-color)]">{{ $t('profile.language') }}</label>
                                    <div class="flex flex-col gap-2">
                                        <Select
                                            id="language-select"
                                            v-model="currentLocale"
                                            :options="availableLocales"
                                            optionLabel="name"
                                            optionValue="code"
                                            @change="onLocaleChange"
                                            class="w-full md:w-80"
                                        />
                                        <small class="text-[var(--p-text-muted-color)]">Choose your preferred interface language.</small>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </Card>
                </div>
            </TabPanel>

            <TabPanel :header="$t('auth.organization')">
                <div class="py-4 flex flex-col gap-6">
                    <!-- Create New Organization Button -->
                    <div class="flex justify-between items-center px-1">
                        <h2 class="text-xl font-bold m-0">My Organizations</h2>
                        <Button :label="$t('auth.createOrg')" icon="pi pi-plus" severity="primary" @click="showCreateOrgDialog = true" />
                    </div>

                    <!-- Memberships List -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card 
                            v-for="membership in authStore.userData.memberships" 
                            :key="membership.organizationId"
                            class="border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)] transition-colors cursor-pointer relative overflow-hidden"
                            :class="[membership.status === 'pending' ? 'opacity-70 grayscale' : '']"
                            @click="membership.status !== 'pending' && authStore.switchOrganization(membership.organizationId)"
                        >
                            <template #title>
                                <div class="flex items-center justify-between">
                                    <span class="text-lg font-black">{{ getOrgName(membership.organizationId) }}</span>
                                    <div class="flex gap-2">
                                        <Tag v-if="membership.status === 'pending'" value="PENDING" severity="warn" />
                                        <Tag v-if="membership.organizationId === authStore.userData.organizationId" value="ACTIVE" severity="success" />
                                    </div>
                                </div>
                            </template>
                            <template #content>
                                <div class="flex flex-col gap-3 py-2">
                                    <div class="flex items-center gap-2">
                                        <i class="pi pi-shield text-[var(--p-primary-color)]"></i>
                                        <span class="text-sm font-bold uppercase opacity-60">{{ membership.role }}</span>
                                    </div>
                                    <div v-if="membership.status === 'pending'" class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700 italic">
                                        Your membership request is awaiting administrator confirmation.
                                    </div>
                                    <div v-else class="flex justify-between items-center mt-2 pt-2 border-t border-[var(--p-content-border-color)]">
                                        <Button v-if="membership.role.includes('Admin')" label="Manage Team" icon="pi pi-users" text size="small" @click.stop="router.push('/organization/users')" />
                                        <Button v-else label="View Organization" icon="pi pi-building" text size="small" />
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>

            <TabPanel :header="$t('nav.projects')">
                <div class="py-4">
                    <Card class="border border-[var(--p-content-border-color)]">
                        <template #title>
                            <span class="text-lg font-bold">{{ $t('profile.usageStatistics') }}</span>
                        </template>
                        <template #content>
                            <div class="flex flex-col items-center justify-center py-20 text-center gap-4 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl opacity-60">
                                <i class="pi pi-chart-bar text-5xl text-[var(--p-text-muted-color)]"></i>
                                <p class="text-lg m-0 text-[var(--p-text-secondary-color)] font-medium">{{ $t('profile.usageStatisticsComingSoon') }}</p>
                            </div>
                        </template>
                    </Card>
                </div>
            </TabPanel>
        </TabView>

        <BuyCreditsDialog v-if="showBuyCredits" @close="showBuyCredits = false" />

        <Dialog v-model:visible="showCreateOrgDialog" :header="$t('auth.createOrg')" :style="{ width: '90vw', maxWidth: '450px' }" modal>
            <form @submit.prevent="createOrganization" class="flex flex-col gap-4 pt-4">
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">{{ $t('common.name') }} *</label>
                    <InputText v-model="orgForm.name" required class="w-full" autofocus />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">{{ $t('queue.status') }} *</label>
                    <Select v-model="orgForm.type" :options="orgTypeOptions" optionLabel="label" optionValue="value" class="w-full" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">{{ $t('profile.email') }} *</label>
                    <InputText v-model="orgForm.email" type="email" required class="w-full" />
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <Button type="button" :label="$t('common.cancel')" text severity="secondary" @click="showCreateOrgDialog = false" />
                    <Button type="submit" :label="$t('common.create')" :loading="submittingOrg" />
                </div>
            </form>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import Card from 'primevue/card';
import Avatar from 'primevue/avatar';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import BuyCreditsDialog from '~/components/BuyCreditsDialog.vue';

definePageMeta({
    layout: "app",
    middleware: "auth",
});

const router = useRouter();
const toast = useToast();
const { locale, locales, setLocale } = useI18n();

const authStore = useAuthStore();
const { user: userRef } = storeToRefs(authStore);
const user = computed(() => userRef.value || {});

const showBuyCredits = ref(false);
const showCreateOrgDialog = ref(false);
const submittingOrg = ref(false);

const getOrgName = (orgId) => {
    const org = authStore.userOrganizations.find(o => o._id.toString() === orgId.toString());
    return org ? org.name : 'Unknown Organization';
};

const orgForm = ref({
    name: '',
    type: 'Contractor',
    email: user.value.email || '',
});

const orgTypeOptions = [
    { label: 'Contractor', value: 'Contractor' },
    { label: 'Manufacturer', value: 'Manufacturer' },
    { label: 'Customer', value: 'Customer' },
];

const createOrganization = async () => {
    submittingOrg.value = true;
    try {
        await $fetch('/api/organizations', {
            method: 'POST',
            body: orgForm.value
        });
        toast.add({ severity: 'success', summary: 'Success', detail: 'Organization created successfully', life: 3000 });
        showCreateOrgDialog.value = false;
        // Refresh auth state to get new organization and role
        await authStore.setUser();
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Failed to create organization', life: 3000 });
    } finally {
        submittingOrg.value = false;
    }
};

const currentLocale = ref(locale.value);
const availableLocales = computed(() => {
    return locales.value.map(l => ({
        code: l.code || l,
        name: l.name || l.toUpperCase()
    }));
});

const onLocaleChange = async (event) => {
    const newLocale = event.value;
    await setLocale(newLocale);
    currentLocale.value = newLocale;
};

const logoutHandler = async () => {
    await authStore.logout();
    router.push({ path: '/' });
};

const addCredits = async () => {
    try {
        const result = await $fetch('/api/user/add-test-credits', {
            method: 'POST'
        });
        // Refresh user data to show new balance
        await authStore.setUser();
        console.log('Added 100 credits! New balance:', result.newBalance);
    } catch (error) {
        console.error('Failed to add credits:', error);
    }
};
</script>

<style scoped>
</style>

