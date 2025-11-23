<template>
    <div class="quick-actions">
        <Button 
            :label="$t('dashboard.newProject')"
            icon="pi pi-plus"
            size="large"
            @click="createProject"
            class="action-button action-button--primary"
        />
        <Button 
            :label="$t('dashboard.uploadCassette')"
            icon="pi pi-upload"
            severity="secondary"
            size="large"
            @click="uploadCassette"
            class="action-button"
        />
        <Button 
            :label="$t('dashboard.buyCredits')"
            icon="pi pi-wallet"
            severity="secondary"
            size="large"
            @click="buyCredits"
            class="action-button"
        />
    </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';

const router = useRouter();
const buyCreditsDialog = useBuyCreditsDialog();

const createProject = () => {
    router.push('/projects/new');
};

const uploadCassette = () => {
    router.push('/assets/cassettes');
};

const buyCredits = () => {
    buyCreditsDialog.value = true;
};
</script>

<style lang="scss" scoped>
.quick-actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    
    .action-button {
        flex: 1;
        min-width: 200px;
        justify-content: center;
        
        &--primary {
            font-weight: 600;
        }
    }
    
    @media (max-width: 768px) {
        .action-button {
            flex-basis: 100%;
        }
    }
}
</style>
