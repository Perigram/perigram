<template>
    <DialogWrapper v-model:isModalOpen="isOpen" @close="$emit('close')">
        <div class="cassette-upload">
            <h3 class="cassette-upload__title">Upload Cassette</h3>
            
            <div class="cassette-upload__form">
                <input 
                    type="text" 
                    v-model="name" 
                    placeholder="Cassette name"
                    class="cassette-upload__input"
                />
                
                <input 
                    type="file" 
                    ref="fileInput"
                    accept=".dxf"
                    @change="handleFileSelect"
                    class="cassette-upload__file-input"
                />

                <div v-if="selectedFile" class="cassette-upload__file-info">
                    Selected: {{ selectedFile.name }}
                </div>

                <div v-if="uploadStatus === 'uploading'" class="cassette-upload__progress">
                    Uploading...
                </div>

                <div v-if="uploadStatus === 'error'" class="cassette-upload__error">
                    Upload failed. Please try again.
                </div>

                <div class="cassette-upload__actions">
                    <MainButton 
                        @click="$emit('close')" 
                        label="Cancel" 
                        :theme="themeType.secondary" 
                        :size="sizeType.m" 
                    />
                    <MainButton 
                        @click="handleUpload" 
                        label="Upload" 
                        :theme="themeType.primary" 
                        :size="sizeType.m"
                        :isDisable="!canUpload"
                    />
                </div>
            </div>
        </div>
    </DialogWrapper>
</template>

<script setup>
import { ref, computed, toRefs } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import { themeType } from '~/constants/theme.constants';
import { sizeType } from '~/constants/size.constants';
import DialogWrapper from './DialogWrapper.vue';
import MainButton from './MainButton.vue';

const emit = defineEmits(['close', 'uploaded']);

const { getters, actions } = cassettesStore;
const { uploadStatus } = toRefs(getters);
const { uploadCassette } = actions;

const isOpen = ref(true);
const name = ref('');
const selectedFile = ref(null);
const fileInput = ref(null);

const canUpload = computed(() => {
    return name.value.trim() !== '' && selectedFile.value !== null && uploadStatus.value !== 'uploading';
});

const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
        selectedFile.value = file;
        if (!name.value) {
            name.value = file.name.replace('.dxf', '');
        }
    }
};

const handleUpload = async () => {
    if (!canUpload.value) return;

    try {
        const cassette = await uploadCassette(selectedFile.value, name.value);
        emit('uploaded', cassette);
    } catch (error) {
        console.error('Upload failed:', error);
    }
};
</script>

<style lang="scss" scoped>
.cassette-upload {
    $self: &;
    padding: 24px;
    min-width: 400px;

    &__title {
        font-size: 20px;
        font-weight: 600;
        color: var(--label-primary);
        margin-bottom: 24px;
    }

    &__form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    &__input {
        width: 100%;
        padding: 12px;
        border: 1px solid var(--separator-primary);
        border-radius: 8px;
        background-color: var(--background-primary);
        color: var(--label-primary);
        font-size: 14px;
    }

    &__file-input {
        padding: 12px;
        border: 1px solid var(--separator-primary);
        border-radius: 8px;
        background-color: var(--background-primary);
        color: var(--label-primary);
    }

    &__file-info {
        font-size: 14px;
        color: var(--label-secondary);
    }

    &__progress {
        text-align: center;
        color: var(--label-secondary);
    }

    &__error {
        color: var(--error-text);
        text-align: center;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
    }
}
</style>
