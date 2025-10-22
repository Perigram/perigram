<template>
    <div class="cassette-manager">
        <div class="cassette-manager__header">
            <MainTitle label="Cassettes" class="cassette-manager__title" />
            <MainButton 
                @click="showUploadDialog = true" 
                label="Upload Cassette" 
                :theme="themeType.primary" 
                :size="sizeType.m" 
            />
        </div>

        <div v-if="cassettes.length === 0" class="cassette-manager__empty">
            No cassettes yet. Upload a DXF file to create one.
        </div>

        <div v-else class="cassette-manager__list">
            <div 
                v-for="cassette in cassettes" 
                :key="cassette._id"
                :class="['cassette-manager__item', {
                    'cassette-manager__item--selected': selectedCassette?._id === cassette._id
                }]"
                @click="selectCassette(cassette._id)"
            >
                <div class="cassette-manager__item-info">
                    <span class="cassette-manager__item-name">{{ cassette.name }}</span>
                    <span class="cassette-manager__item-status">{{ cassette.processingStatus }}</span>
                </div>
                <div class="cassette-manager__item-actions">
                    <MainButton 
                        @click.stop="editCassette(cassette)" 
                        label="Edit" 
                        :theme="themeType.secondary" 
                        :size="sizeType.s" 
                    />
                    <MainButton 
                        @click.stop="handleDelete(cassette._id)" 
                        label="Delete" 
                        :theme="themeType.ghost" 
                        :size="sizeType.s" 
                    />
                </div>
            </div>
        </div>

        <CassetteUploadDialog 
            v-if="showUploadDialog" 
            @close="showUploadDialog = false"
            @uploaded="handleUploaded"
        />

        <CassetteEditorDialog 
            v-if="showEditDialog && editingCassette" 
            :cassette="editingCassette"
            @close="showEditDialog = false"
            @saved="handleSaved"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, computed, toRefs } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import { themeType } from '~/constants/theme.constants';
import { sizeType } from '~/constants/size.constants';
import MainButton from './MainButton.vue';
import MainTitle from './MainTitle.vue';
import CassetteUploadDialog from './CassetteUploadDialog.vue';
import CassetteEditorDialog from './CassetteEditorDialog.vue';

const { getters, actions } = cassettesStore;
const { cassettes, selectedCassette } = toRefs(getters);
const { fetchCassettes, selectCassette, deleteCassette } = actions;

const showUploadDialog = ref(false);
const showEditDialog = ref(false);
const editingCassette = ref(null);

onMounted(async () => {
    await fetchCassettes();
});

const handleDelete = async (cassetteId) => {
    if (confirm('Delete this cassette?')) {
        await deleteCassette(cassetteId);
    }
};

const editCassette = (cassette) => {
    editingCassette.value = cassette;
    showEditDialog.value = true;
};

const handleUploaded = async (cassette) => {
    showUploadDialog.value = false;
    editingCassette.value = cassette;
    showEditDialog.value = true;
};

const handleSaved = () => {
    showEditDialog.value = false;
    editingCassette.value = null;
};
</script>

<style lang="scss" scoped>
.cassette-manager {
    $self: &;

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
    }

    &__title {
        margin: 0;
    }

    &__empty {
        text-align: center;
        color: var(--label-tertiary);
        padding: 48px 24px;
    }

    &__list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    &__item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        background-color: var(--fill-secondary);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            background-color: var(--fill-tertiary);
        }

        &--selected {
            background-color: var(--accent-secondary);
            border: 2px solid var(--accent-primary);
        }
    }

    &__item-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    &__item-name {
        font-size: 16px;
        font-weight: 500;
        color: var(--label-primary);
    }

    &__item-status {
        font-size: 12px;
        color: var(--label-tertiary);
    }

    &__item-actions {
        display: flex;
        gap: 8px;
    }
}
</style>
