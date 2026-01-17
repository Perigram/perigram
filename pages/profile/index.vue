<template>
    <div class="p-4">
        <TabView>
            <TabPanel :header="$t('profile.account')">
                <div class="grid">
                    <div class="col-12 md:col-4">
                        <Card>
                            <template #title>{{ $t('profile.title') }}</template>
                            <template #content>
                                <div class="flex align-items-center">
                                    <Avatar :label="user.name ? user.name[0].toUpperCase() : 'U'" size="xlarge" shape="circle" />
                                    <div class="ml-3">
                                        <p class="font-bold">{{ user.name }}</p>
                                        <p class="text-sm text-gray-500">{{ user.email }}</p>
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </div>
                    <div class="col-12 md:col-8">
                        <Card>
                            <template #title>{{ $t('profile.authentication') }}</template>
                            <template #content>
                                <p>{{ $t('profile.loggedInOAuth') }}</p>
                                <Button :label="$t('nav.logout')" icon="pi pi-sign-out" class="p-button-danger mt-4" @click="logoutHandler" />
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>

            <TabPanel :header="$t('profile.billing')">
                <div class="grid">
                    <div class="col-12 md:col-6">
                        <Card>
                            <template #title>{{ $t('billing.creditBalance') }}</template>
                            <template #content>
                                <div class="flex justify-content-between align-items-center">
                                    <div>
                                        <p class="text-2xl font-bold">{{ user.balance || 0 }} {{ $t('billing.credits') }}</p>
                                    </div>
                                    <Button :label="$t('profile.buyCredits')" icon="pi pi-shopping-cart" @click="showBuyCredits = true" />
                                </div>
                                <Button :label="$t('billing.addTestCredits')" icon="pi pi-plus" class="p-button-secondary mt-4" @click="addCredits" />
                            </template>
                        </Card>
                    </div>
                    <div class="col-12 md:col-6">
                        <Card>
                            <template #title>{{ $t('billing.purchaseHistory') }}</template>
                            <template #content>
                                <p>{{ $t('billing.noHistory') }}</p>
                                <!-- TODO: Implement purchase history table -->
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>

            <TabPanel :header="$t('profile.preferences')">
                <div class="grid">
                    <div class="col-12">
                        <Card>
                            <template #title>{{ $t('profile.settings') }}</template>
                            <template #content>
                                <div class="field">
                                    <label>{{ $t('profile.theme') }}</label>
                                    <p>{{ $t('profile.themeNotImplemented') }}</p>
                                </div>
                                <div class="field mt-4">
                                    <label for="language-select">{{ $t('profile.language') }}</label>
                                    <Dropdown
                                        id="language-select"
                                        v-model="currentLocale"
                                        :options="availableLocales"
                                        optionLabel="name"
                                        optionValue="code"
                                        @change="onLocaleChange"
                                        class="w-full"
                                    />
                                </div>
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>

            <TabPanel :header="$t('nav.projects')">
                <div class="grid">
                    <div class="col-12">
                        <Card>
                            <template #title>{{ $t('profile.usageStatistics') }}</template>
                            <template #content>
                                <p>{{ $t('profile.usageStatisticsComingSoon') }}</p>
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>
        </TabView>

        <BuyCreditsDialog v-if="showBuyCredits" @close="showBuyCredits = false" />
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
import Dropdown from 'primevue/dropdown';
import BuyCreditsDialog from '~/components/BuyCreditsDialog.vue';

definePageMeta({
    layout: "app",
    middleware: "auth",
});

const router = useRouter();
const { locale, locales, setLocale } = useI18n();

const authStore = useAuthStore();
const { user: userRef } = storeToRefs(authStore);
const user = computed(() => userRef.value || {});

const showBuyCredits = ref(false);

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
