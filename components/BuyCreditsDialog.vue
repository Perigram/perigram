<template>
    <Dialog 
        v-model:visible="dialogVisible" 
        header="Buy Credits" 
        :modal="true"
        :style="{ width: '500px' }"
        @update:visible="$emit('close')"
    >
        <div class="buy-credits-content">
            <div class="current-balance">
                <p>Your current balance:</p>
                <Tag :value="user.balance || 0" severity="info" />
            </div>

            <div v-if="loading" class="text-center">
                <ProgressSpinner />
            </div>

            <div v-else-if="error" class="error-message">
                <Message severity="error">{{ error }}</Message>
            </div>

            <div v-else class="options-container">
                <label>Select a package:</label>
                <SelectButton 
                    v-model="selectedOption" 
                    :options="paymentOptions" 
                    optionLabel="title"
                    class="w-full"
                >
                    <template #option="slotProps">
                        <div class="credit-option">
                            <div class="font-bold">{{ slotProps.option.title }}</div>
                            <div>{{ slotProps.option.description }}</div>
                            <div class="font-bold mt-2">{{ slotProps.option.credit }} credits</div>
                        </div>
                    </template>
                </SelectButton>
            </div>
        </div>

        <template #footer>
            <Button label="Cancel" severity="secondary" @click="$emit('close')" />
            <Button 
                label="Buy Now" 
                @click="buy" 
                :disabled="!selectedOption || buying"
                :loading="buying"
            />
        </template>
    </Dialog>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
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
        error.value = 'Failed to load payment options.';
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
        error.value = 'Failed to create payment link.';
        console.error(err);
    } finally {
        buying.value = false;
    }
};
</script>

<style scoped>
.buy-credits-content {
    padding: 1rem 0;
}
.current-balance {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background-color: var(--surface-ground);
    border-radius: 6px;
    margin-bottom: 1.5rem;
}
.options-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.credit-option {
    padding: 0.5rem;
    text-align: center;
}
.error-message {
    margin-top: 1rem;
}
</style>
