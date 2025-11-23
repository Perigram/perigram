<template>
    <div class="dashboard-stats">
        <Card class="stat-card">
            <template #content>
                <div class="stat-content">
                    <i class="pi pi-folder stat-icon stat-icon--projects"></i>
                    <div class="stat-info">
                        <div class="stat-value">{{ projectsCount }}</div>
                        <div class="stat-label">{{ $t('dashboard.projects') }}</div>
                    </div>
                </div>
            </template>
        </Card>

        <Card class="stat-card">
            <template #content>
                <div class="stat-content">
                    <i class="pi pi-file stat-icon stat-icon--cassettes"></i>
                    <div class="stat-info">
                        <div class="stat-value">{{ cassettesCount }}</div>
                        <div class="stat-label">{{ $t('dashboard.cassettes') }}</div>
                    </div>
                </div>
            </template>
        </Card>

        <Card class="stat-card">
            <template #content>
                <div class="stat-content">
                    <i class="pi pi-wallet stat-icon stat-icon--balance"></i>
                    <div class="stat-info">
                        <div class="stat-value">{{ balance }}</div>
                        <div class="stat-label">{{ $t('dashboard.balance') }}</div>
                    </div>
                </div>
            </template>
        </Card>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Card from 'primevue/card';

const props = defineProps({
    projectsCount: {
        type: Number,
        default: 0
    },
    cassettesCount: {
        type: Number,
        default: 0
    }
});

const balance = ref('...');

onMounted(() => {
    const eventSource = new EventSource('/api/user/balance');
    
    eventSource.onmessage = (event) => {
        try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'initial' || parsed.type === 'newBalance') {
                balance.value = parsed.data.balance;
            }
        } catch (e) {
            console.error('Error parsing balance:', e);
        }
    };
    
    eventSource.onerror = () => {
        eventSource.close();
    };
});
</script>

<style lang="scss" scoped>
.dashboard-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
}

.stat-card {
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    
    :deep(.p-card-content) {
        padding: 1.5rem;
    }
}

.stat-content {
    display: flex;
    align-items: center;
    gap: 1.5rem;
}

.stat-icon {
    font-size: 2.5rem;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--border-radius);
    
    &--projects {
        background: rgba(var(--primary-500), 0.1);
        color: var(--primary-color);
    }
    
    &--cassettes {
        background: rgba(var(--blue-500), 0.1);
        color: var(--blue-500);
    }
    
    &--balance {
        background: rgba(var(--green-500), 0.1);
        color: var(--green-500);
    }
}

.stat-info {
    flex: 1;
}

.stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-color);
    line-height: 1;
    margin-bottom: 0.25rem;
}

.stat-label {
    font-size: 0.875rem;
    color: var(--text-color-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
</style>
