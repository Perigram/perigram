<template>
    <StandardPage :title="$t('nav.profile')">
        <Tabs value="0">
            <TabList>
                <Tab value="0"><span>{{ $t('profile.account') }}</span></Tab>
                <Tab value="1"><span>{{ $t('profile.billing') }}</span></Tab>
                <Tab value="2"><span>{{ $t('profile.preferences') }}</span></Tab>
                <Tab value="3"><span>{{ $t('auth.organization') }}</span></Tab>
                <Tab value="4"><span>{{ $t('nav.projects') }}</span></Tab>
            </TabList>
            <TabPanels>
                <TabPanel value="0">
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-6 py-4">
                        <div class="md:col-span-4">
                            <Panel class="h-full" :header="$t('profile.title')">
                                    <div class="flex flex-col items-center text-center gap-4 py-4">
                                        <Avatar :label="user.name ? user.name[0].toUpperCase() : 'U'" size="xlarge" shape="circle" />
                                        <div class="flex flex-col gap-1">
                                            <p class="m-0">{{ user.name }}</p>
                                            <p class="m-0 italic">{{ user.email }}</p>
                                        </div>
                                    </div>
                            </Panel>
                        </div>
                        <div class="md:col-span-8">
                            <Panel class="h-full" :header="$t('profile.authentication')">
                                    <div class="flex flex-col gap-6 py-2">
                                        <div class="mt-auto">
                                            <Button :label="$t('nav.logout')" icon="pi pi-sign-out" severity="danger" outlined @click="logoutHandler" />
                                        </div>
                                    </div>
                            </Panel>
                        </div>
                    </div>
                </TabPanel>

                <TabPanel value="1">
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
                        <Panel :header="$t('billing.creditBalance')">
                                <div class="flex flex-col gap-6 py-2">
                                    <Panel>
                                            <div class="flex justify-between items-center p-6">
                                                <div class="flex flex-col gap-1">
                                                    <small>{{ $t('profile.balance') }}</small>
                                                    <span class="text-4xl font-bold">{{ user.balance || 0 }}</span>
                                                </div>
                                                <Button :label="$t('profile.buyCredits')" icon="pi pi-shopping-cart" size="large" @click="showBuyCredits = true" />
                                            </div>
                                    </Panel>
                                    <div class="pt-4 border-t border-dashed">
                                        <p class="mb-3">{{ $t('profile.developerTools') }}</p>
                                        <Button :label="$t('billing.addTestCredits')" icon="pi pi-plus" severity="secondary" text @click="addCredits" />
                                    </div>
                                </div>
                        </Panel>
                        
                        <Panel :header="$t('billing.purchaseHistory')">
                                <StateBlock :message="$t('billing.noHistory')" icon="pi pi-history" />
                        </Panel>
                    </div>
                </TabPanel>

                <TabPanel value="2">
                    <div class="max-w-2xl py-4">
                        <Panel :header="$t('profile.settings')">
                                <div class="flex flex-col gap-8 py-2">
                                    <div class="flex flex-col gap-3">
                                        <label>{{ $t('profile.theme') }}</label>
                                        <Panel>
                                                <div class="flex items-center gap-3">
                                                    <i class="pi pi-palette text-xl"></i>
                                                    <p class="m-0 italic">{{ $t('profile.themeNotImplemented') }}</p>
                                                </div>
                                        </Panel>
                                    </div>
                                    
                                    <div class="flex flex-col gap-3">
                                        <label for="language-select">{{ $t('profile.language') }}</label>
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
                                            <small>{{ $t('profile.languageHelp') }}</small>
                                        </div>
                                    </div>
                                </div>
                        </Panel>
                    </div>
                </TabPanel>

                <TabPanel value="3">
                    <div class="py-4 flex flex-col gap-6">
                        <!-- Create New Organization Button -->
                        <ActionToolbar :title="$t('profile.myOrganizations')">
                            <template #actions>
                                <Button :label="$t('auth.createOrg')" icon="pi pi-plus" @click="showCreateOrgDialog = true" />
                            </template>
                        </ActionToolbar>

                        <!-- Memberships List -->
                        <ResponsiveGrid variant="wide">
                            <Panel 
                                v-for="membership in authStore.userData.memberships" 
                                :key="membership.organizationId"
                                class="relative overflow-hidden"
                                :class="[membership.status === 'pending' ? 'opacity-50' : '']"
                                @click="membership.status !== 'pending' && authStore.switchOrganization(membership.organizationId)"
                            >
                                    <div class="flex items-center justify-between mb-4">
                                        <span class="text-lg">{{ getOrgName(membership.organizationId) }}</span>
                                        <div class="flex gap-2">
                                            <Tag v-if="membership.status === 'pending'" :value="$t('common.pending')" severity="warn" />
                                            <Tag v-if="membership.organizationId === authStore.userData.organizationId" :value="$t('common.active')" severity="success" />
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-3 py-2">
                                        <div class="flex items-center gap-2">
                                            <i class="pi pi-shield"></i>
                                            <span>{{ membership.role }}</span>
                                        </div>
                                        <div v-if="membership.status === 'pending'" class="mt-2 py-2 italic opacity-60">
                                            {{ $t('profile.membershipPending') }}
                                        </div>
                                        <div v-else class="flex justify-between items-center mt-2 pt-2 border-t border-muted border-dashed">
                                            <Button :label="$t('profile.viewOrganization')" icon="pi pi-building" text size="small" @click.stop="router.push('/organization')" />
                                            <Button v-if="membership.role.includes('Admin')" :label="$t('profile.manageTeam')" icon="pi pi-users" text size="small" @click.stop="router.push('/organization/users')" />
                                            <Button v-if="membership.role.includes('Admin')" :label="$t('processDesigner.title')" icon="pi pi-sitemap" text size="small" @click.stop="router.push('/organization/process')" />
                                        </div>
                                    </div>
                            </Panel>
                        </ResponsiveGrid>
                    </div>
                </TabPanel>

                <TabPanel value="4">
                    <div class="py-4">
                        <Panel :header="$t('profile.usageStatistics')">
                                <StateBlock :message="$t('profile.usageStatisticsComingSoon')" icon="pi pi-chart-bar" />
                        </Panel>
                    </div>
                </TabPanel>
            </TabPanels>
        </Tabs>

        <BuyCreditsDialog v-if="showBuyCredits" @close="showBuyCredits = false" />

        <StandardDialog v-model:visible="showCreateOrgDialog" :header="$t('auth.createOrg')" size="sm">
            <form @submit.prevent="createOrganization" class="flex flex-col gap-4 pt-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.name') }} *</label>
                    <InputText v-model="orgForm.name" required class="w-full" autofocus />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('queue.status') }} *</label>
                    <Select v-model="orgForm.type" :options="orgTypeOptions" optionLabel="label" optionValue="value" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('profile.email') }} *</label>
                    <InputText v-model="orgForm.email" type="email" required class="w-full" />
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <Button type="button" :label="$t('common.cancel')" text severity="secondary" @click="showCreateOrgDialog = false" />
                    <Button type="submit" :label="$t('common.create')" :loading="submittingOrg" />
                </div>
            </form>
        </StandardDialog>
    </StandardPage>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Panel from 'primevue/panel';
import Avatar from 'primevue/avatar';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import BuyCreditsDialog from '~/components/BuyCreditsDialog.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';
import { selectOptionText } from '~/utils/selectOptions';

definePageMeta({
    layout: "app",
    middleware: "auth",
});

const router = useRouter();
const toast = useToast();
const { t, locale, locales, setLocale } = useI18n();
const organizationsEntity = useEntity('organization');

const authStore = useAuthStore();
const { user: userRef } = storeToRefs(authStore);
const user = computed(() => userRef.value || {});

const showBuyCredits = ref(false);
const showCreateOrgDialog = ref(false);
const submittingOrg = ref(false);

const getOrgName = (orgId) => {
    const org = authStore.userOrganizations.find(o => o._id.toString() === orgId.toString());
    return org ? org.name : t('profile.unknownOrganization');
};

const orgForm = ref({
    name: '',
    type: 'Contractor',
    email: user.value.email || '',
});

const orgTypeOptions = [
    { label: t('auth.orgTypes.contractor'), value: 'Contractor' },
    { label: t('auth.orgTypes.manufacturer'), value: 'Manufacturer' },
    { label: t('auth.orgTypes.customer'), value: 'Customer' },
];

const createOrganization = async () => {
    submittingOrg.value = true;
    try {
        await organizationsEntity.create(orgForm.value);
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.organizationCreated'), life: 3000 });
        showCreateOrgDialog.value = false;
        // Refresh auth state to get new organization and role
        await authStore.setUser();
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('auth.organizationCreateFailed'), life: 3000 });
    } finally {
        submittingOrg.value = false;
    }
};

const currentLocale = ref(locale.value);
const availableLocales = computed(() => {
    return locales.value.map(l => ({
        code: selectOptionText(l?.code, l),
        name: selectOptionText(l?.name, selectOptionText(l?.code, l).toUpperCase())
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
