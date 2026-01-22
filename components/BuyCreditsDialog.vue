<template>
    <Dialog 
        v-model:visible="dialogVisible" 
        :header="$t('profile.buyCredits')" 
        :modal="true"
        :style="{ width: '95vw', maxWidth: '500px' }"
        @update:visible="$emit('close')"
    >
        <div class="flex flex-col gap-6 py-2">
            <div class="flex justify-between items-center bg-[var(--p-content-background)] p-4 rounded-xl border border-[var(--p-content-border-color)]">
                <p class="m-0 font-medium text-[var(--p-text-color)]">{{ $t('billing.currentBalance') }}</p>
                <Tag :value="user.balance || 0" severity="info" class="text-base font-bold px-3" />
            </div>

            <div v-if="loading" class="flex items-center justify-center py-12">
                <ProgressSpinner style="width: 40px; height: 40px" />
            </div>

            <div v-else-if="error">
                <Message severity="error" class="w-full">{{ error }}</Message>
            </div>

            <div v-else class="flex flex-col gap-3">
                <label class="font-bold text-sm uppercase tracking-wider text-[var(--p-text-muted-color)]">{{ $t('billing.selectPackage') }}</label>
                <SelectButton 
                    v-model="selectedOption" 
                    :options="paymentOptions" 
                    optionLabel="title"
                    class="w-full flex flex-col gap-2 !bg-transparent !border-none"
                    pt:root:class="!bg-transparent !border-none !flex-col !gap-2"
                    pt:button:class="!border !border-[var(--p-content-border-color)] !rounded-xl !text-left !px-4 !py-3 hover:!border-[var(--p-primary-color)] transition-all"
                >
                    <template #option="slotProps">
                        <div class="flex flex-col gap-1">
                            <div class="font-bold text-base">{{ slotProps.option.title }}</div>
                            <div class="text-xs text-[var(--p-text-muted-color)]">{{ slotProps.option.description }}</div>
                            <div class="font-black text-[var(--p-primary-color)] mt-1 tracking-tight">{{ slotProps.option.credit }} {{ $t('billing.credits') }}</div>
                        </div>
                    </template>
                </SelectButton>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2 pt-2">
                <Button :label="$t('common.cancel')" severity="secondary" text @click="$emit('close')" />
                <Button 
                    :label="$t('billing.buyNow')" 
                    icon="pi pi-shopping-cart"
                    @click="buy" 
                    :disabled="!selectedOption || buying"
                    :loading="buying"
                    class="px-6"
                />
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';

const emit = defineEmits(['close']);

const authStore = useAuthStore();
const { t } = useI18n();
const { user: userRef } = storeToRefs(authStore);
const user = computed(() => userRef.value || {});

const dialogVisible = ref(true);
const paymentOptions = ref([]);
const selectedOption = ref(null);
const loading = ref(true);
const buying = ref(false);
const error = ref(null);

onMounted(async () => {
    try {
        const data = await $fetch('/api/payment/options');
        paymentOptions.value = data.options;
        if (data.options.length > 0) {
            selectedOption.value = data.options[0];
        }
    } catch (err) {
        error.value = t('billing.errors.loadOptionsFailed');
        console.error(err);
    } finally {
        loading.value = false;
    }
});

const buy = async () => {
    if (!selectedOption.value) return;

    buying.value = true;
    try {
        const response = await $fetch(`/api/payment/paywalllink?stripePriceId=${selectedOption.value.stripePriceId}`);
        navigateTo(response.url, { external: true });
    } catch (err) {
        error.value = t('billing.errors.createLinkFailed');
        console.error(err);
    } finally {
        buying.value = false;
    }
};
</script>

<style scoped>
</style>

