<template>
    <div class="">
        <TabView>
            <TabPanel header="Account">
                <div class="grid">
                    <div class="col-12 md:col-4">
                        <Card>
                            <template #title>Profile</template>
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
                            <template #title>Authentication</template>
                            <template #content>
                                <p>You are logged in with your OAuth provider.</p>
                                <Button label="Logout" icon="pi pi-sign-out" class="p-button-danger mt-4" @click="logoutHandler" />
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>

            <TabPanel header="Billing">
                <div class="grid">
                    <div class="col-12 md:col-6">
                        <Card>
                            <template #title>Credit Balance</template>
                            <template #content>
                                <div class="flex justify-content-between align-items-center">
                                    <div>
                                        <p class="text-2xl font-bold">{{ user.balance || 0 }} Credits</p>
                                    </div>
                                    <Button label="Buy Credits" icon="pi pi-shopping-cart" @click="showBuyCredits = true" />
                                </div>
                                <Button label="Add 100 Test Credits" icon="pi pi-plus" class="p-button-secondary mt-4" @click="addCredits" />
                            </template>
                        </Card>
                    </div>
                    <div class="col-12 md:col-6">
                        <Card>
                            <template #title>Purchase History</template>
                            <template #content>
                                <p>No purchase history yet.</p>
                                <!-- TODO: Implement purchase history table -->
                            </template>
                        </Card>
                    </div>
                </div>
            </TabPanel>

            <TabPanel header="Preferences">
                <div class="grid">
                    <div class="col-12">
                        <Card>
                            <template #title>Settings</template>
                            <template #content>
                                <div class="field">
                                    <label>Theme</label>
                                    <p>Theme selection is not yet implemented.</p>
                                </div>
                                <div class="field mt-4">
                                    <label for="language-select">Language</label>
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

            <TabPanel header="Projects">
                <div class="grid">
                    <div class="col-12">
                        <Card>
                            <template #title>Usage Statistics</template>
                            <template #content>
                                <p>Project usage statistics are not yet implemented.</p>
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
import { authStore } from '~/composables/auth';
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

const { getters, actions } = authStore;
const { logout } = actions;
const user = computed(() => getters.user.value || {});

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
    await logout();
    router.push({ path: '/' });
};

const addCredits = async () => {
    try {
        const result = await $fetch('/api/user/add-test-credits', {
            method: 'POST'
        });
        // Refresh user data to show new balance
        await actions.setUser();
        console.log('Added 100 credits! New balance:', result.newBalance);
    } catch (error) {
        console.error('Failed to add credits:', error);
    }
};
</script>

<style scoped>
</style>
