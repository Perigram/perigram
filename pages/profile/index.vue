<template>
    <StandardPage :title="$t('nav.profile')">
        <Tabs v-model:value="activeProfileTab">
            <TabList>
                <Tab value="0">{{ $t('profile.account') }}</Tab>
                <Tab value="1">{{ $t('profile.preferences') }}</Tab>
                <Tab value="2">{{ $t('auth.organization') }}</Tab>
            </TabList>
        </Tabs>
        <div>
                <section v-if="activeProfileTab === '0'">
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-6 py-4">
                        <div class="md:col-span-4">
                            <Panel class="h-full" :header="$t('profile.title')">
                                    <div class="flex flex-col items-center text-center gap-4 py-4">
                                        <Avatar :image="user.avatarUrl || null" :label="!user.avatarUrl && user.name ? user.name[0].toUpperCase() : null" size="xlarge" shape="circle" class="[&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover" />
                                        <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="uploadAvatar" />
                                        <div class="flex flex-wrap justify-center gap-2">
                                            <Button :label="$t('profile.changeAvatar')" icon="pi pi-camera" size="small" :loading="avatarUploading" @click="avatarInput?.click()" />
                                            <Button v-if="user.avatarUrl" :label="$t('profile.removeAvatar')" icon="pi pi-trash" severity="secondary" text size="small" :disabled="avatarUploading" @click="removeAvatar" />
                                        </div>
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
                </section>

                <section v-else-if="activeProfileTab === '1'">
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
                </section>

                <section v-else>
                    <div class="py-4 flex flex-col gap-6">
                        <!-- Create New Organization Button -->
                        <ActionToolbar :title="$t('profile.myOrganizations')">
                            <template #actions>
                                <Button :label="$t('auth.createOrg')" icon="pi pi-plus" @click="showCreateOrgDialog = true" />
                            </template>
                        </ActionToolbar>

                        <ResponsiveGrid variant="wide">
                            <OrganizationCard
                                v-for="entry in organizationMemberships"
                                :key="entry.id"
                                :organization="entry.organization"
                            >
                                <template #context>
                                    <Tag v-if="entry.membership.status === 'pending'" :value="$t('common.pending')" severity="warn" size="small" />
                                    <Tag v-else-if="entry.active" :value="$t('common.active')" severity="success" size="small" />
                                </template>
                                <template #actions>
                                    <div class="flex flex-wrap justify-end gap-2">
                                        <Button
                                            v-if="entry.membership.status !== 'pending' && !entry.active"
                                            :label="$t('profile.switchOrganization')"
                                            icon="pi pi-arrow-right-arrow-left"
                                            size="small"
                                            @click="switchOrganization(entry.id)"
                                        />
                                        <Button
                                            v-else-if="entry.active"
                                            :label="$t('profile.viewOrganization')"
                                            icon="pi pi-arrow-right"
                                            size="small"
                                            @click="router.push(organizationOverviewRoute)"
                                        />
                                    </div>
                                </template>
                            </OrganizationCard>
                        </ResponsiveGrid>
                    </div>
                </section>
        </div>

        <StandardDialog v-model:visible="showCreateOrgDialog" :header="$t('auth.createOrg')" size="sm">
            <form @submit.prevent="createOrganization" class="flex flex-col gap-4 pt-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.name') }} *</label>
                    <InputText v-model="orgForm.name" required class="w-full" autofocus />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('auth.processTemplate') }} *</label>
                    <Select v-model="orgForm.processTemplateId" :options="processTemplateOptions" optionLabel="label" optionValue="value" class="w-full" />
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
import Panel from 'primevue/panel';
import Avatar from 'primevue/avatar';
import Select from '~/components/shared/EntitySelect.vue';
import Tag from 'primevue/tag';
import InputText from 'primevue/inputtext';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import Tabs from 'primevue/tabs';
import { useToast } from 'primevue/usetoast';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import OrganizationCard from '~/components/entities/Organization/OrganizationCard.vue';
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
const organizationOverviewScreen = computed(() => authStore.screenManifest.find(screen => (
    screen.kind === 'system'
    && screen.template === 'organizationOverview'
    && screen.route === '/organization'
)) || null);
const organizationOverviewRoute = computed(() => organizationOverviewScreen.value?.route || '/organization');
const showCreateOrgDialog = ref(false);
const submittingOrg = ref(false);
const avatarInput = ref(null);
const avatarUploading = ref(false);
const activeProfileTab = ref('0');

const organizationMemberships = computed(() => authStore.memberships.map(membership => {
    const id = String(membership.organizationId || '');
    const organization = authStore.userOrganizations.find(item => String(item._id || item.id) === id) || {
        _id: id,
        identity: { name: t('profile.unknownOrganization') },
        lineage: {},
        data: {}
    };
    return {
        id,
        membership,
        organization,
        active: id === String(authStore.userData.organizationId || authStore.organizationData?._id || '')
    };
}));

const orgForm = ref({
    name: '',
    processTemplateId: 'contractor',
    email: user.value.email || '',
});

const processTemplateOptions = [
    { label: t('auth.processTemplates.contractor'), value: 'contractor' },
    { label: t('auth.processTemplates.manufacturer'), value: 'manufacturer' },
    { label: t('auth.processTemplates.customer'), value: 'customer' },
    { label: t('auth.processTemplates.serviceProvider'), value: 'serviceProvider' },
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

const switchOrganization = async (organizationId) => {
    await authStore.switchOrganization(organizationId);
};

const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    avatarUploading.value = true;
    try {
        const form = new FormData();
        form.append('file', file);
        await $fetch(`/api/users/${authStore.userData.userId || authStore.userData.id}/avatar`, { method: 'PUT', body: form });
        await authStore.setUser();
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('profile.avatarUpdated'), life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
    } finally {
        avatarUploading.value = false;
        event.target.value = '';
    }
};

const removeAvatar = async () => {
    avatarUploading.value = true;
    try {
        await $fetch(`/api/users/${authStore.userData.userId || authStore.userData.id}/avatar`, { method: 'DELETE' });
        await authStore.setUser();
    } finally {
        avatarUploading.value = false;
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

</script>
