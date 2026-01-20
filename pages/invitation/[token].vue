<template>
    <div class="min-h-screen flex items-center justify-center bg-[var(--p-surface-ground)] p-4">
        <Card class="w-full max-w-md border border-[var(--p-content-border-color)]">
            <template #title>
                <div class="flex flex-col items-center gap-4 text-center">
                    <div class="w-16 h-16 rounded-full bg-[var(--p-primary-50)] flex items-center justify-center">
                        <i class="pi pi-building text-3xl text-[var(--p-primary-color)]"></i>
                    </div>
                    <h1 class="text-2xl font-black m-0">Organization Invitation</h1>
                </div>
            </template>
            <template #content>
                <div v-if="loading" class="flex flex-col items-center py-12 gap-4">
                    <ProgressSpinner />
                    <p class="text-[var(--p-text-muted-color)] font-medium">Fetching invitation details...</p>
                </div>
                
                <div v-else-if="error" class="text-center py-8 flex flex-col gap-4">
                    <Message severity="error">{{ error }}</Message>
                    <Button label="Go to Home" @click="navigateTo('/')" text />
                </div>

                <div v-else-if="invitation" class="flex flex-col gap-6 py-4">
                    <div class="p-6 bg-[var(--p-surface-50)] border rounded-2xl text-center">
                        <p class="text-sm text-[var(--p-text-muted-color)] uppercase font-black tracking-widest mb-2">You are invited to join</p>
                        <h2 class="text-2xl font-black m-0 text-[var(--p-text-color)]">{{ invitation.organizationName }}</h2>
                        <div class="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-[var(--p-primary-color)]/10 text-[var(--p-primary-color)] rounded-full">
                            <i class="pi pi-shield text-xs"></i>
                            <span class="text-xs font-bold uppercase">{{ invitation.role }}</span>
                        </div>
                    </div>

                    <div class="flex flex-col gap-3">
                        <Button 
                            label="Join Organization" 
                            icon="pi pi-user-plus" 
                            class="w-full py-4 font-black uppercase text-lg" 
                            :loading="joining"
                            @click="joinHandler" 
                        />
                        <Button 
                            label="Decline" 
                            severity="secondary" 
                            text 
                            class="w-full font-bold uppercase text-sm" 
                            :disabled="joining"
                            @click="navigateTo('/')"
                        />
                    </div>
                </div>
            </template>
        </Card>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';

definePageMeta({
    layout: false,
    middleware: 'auth'
});

const route = useRoute();
const toast = useToast();
const token = route.params.token;

const invitation = ref(null);
const loading = ref(true);
const error = ref(null);
const joining = ref(false);

const fetchInvitation = async () => {
    loading.value = true;
    try {
        invitation.value = await $fetch(`/api/invitations/${token}`);
    } catch (err) {
        error.value = err.message || 'Failed to load invitation';
    } finally {
        loading.value = false;
    }
};

const joinHandler = async () => {
    joining.value = true;
    try {
        await $fetch(`/api/invitations/${token}/join`, { method: 'POST' });
        toast.add({ severity: 'success', summary: 'Success', detail: 'You have joined the organization', life: 3000 });
        navigateTo('/profile');
    } catch (err) {
        toast.add({ severity: 'error', summary: 'Error', detail: err.message, life: 3000 });
    } finally {
        joining.value = false;
    }
};

onMounted(fetchInvitation);
</script>
