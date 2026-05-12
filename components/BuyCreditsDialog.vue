<template>
    <Dialog v-model:visible="visible" :header="$t('billing.title')" modal>
        <div class="flex flex-col gap-6 py-4">
            <Card>
                <template #content>
                    <div class="flex justify-between items-center">
                        <div class="flex flex-col gap-1">
                            <small>{{ $t('billing.currentBalance') }}</small>
                            <Tag :value="user.balance || 0" severity="info" />
                        </div>
                    </div>
                </template>
            </Card>

            <div v-if="loading" class="flex justify-center py-8">
                <ProgressSpinner />
            </div>
            
            <div v-else-if="error" class="p-4">
                <Message severity="error">{{ error }}</Message>
            </div>

            <div v-else class="flex flex-col gap-4">
                <label>{{ $t('billing.selectPackage') }}</label>
                <Select v-model="selectedOption" :options="options" optionLabel="title" class="w-full">
                    <template #option="slotProps">
                        <div class="flex flex-col gap-1">
                            <span>{{ slotProps.option.title }}</span>
                            <small>{{ slotProps.option.description }}</small>
                            <div class="mt-1">{{ slotProps.option.credit }} {{ $t('billing.credits') }}</div>
                        </div>
                    </template>
                </Select>
            </div>
        </div>
        <template #footer>
            <Button :label="$t('common.cancel')" severity="secondary" text @click="$emit('close')" />
            <Button :label="$t('billing.buyNow')" @click="handleBuy" :disabled="!selectedOption || processing" :loading="processing" />
        </template>
    </Dialog>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';
import Message from 'primevue/message';

const emit = defineEmits(['close']);
const { t } = useI18n();
const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const visible = ref(true);
const options = ref([]);
const selectedOption = ref(null);
const loading = ref(true);
const processing = ref(false);
const error = ref(null);

onMounted(async () => {
    try {
        const data = await $fetch('/api/payment/options');
        options.value = data.options;
        if (options.value.length > 0) {
            selectedOption.value = options.value[0];
        }
    } catch (err) {
        error.value = t('billing.errors.loadOptionsFailed');
    } finally {
        loading.value = false;
    }
});

const handleBuy = async () => {
    if (!selectedOption.value) return;
    processing.value = true;
    try {
        const data = await $fetch(`/api/payment/paywalllink?stripePriceId=${selectedOption.value.stripePriceId}`);
        window.location.href = data.url;
    } catch (err) {
        error.value = t('billing.errors.createLinkFailed');
    } finally {
        processing.value = false;
    }
};
</script>
