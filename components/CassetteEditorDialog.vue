<template>
    <DialogWrapper v-model:isModalOpen="isOpen" @close="$emit('close')">
        <div class="cassette-editor">
            <h3 class="cassette-editor__title">{{ $t('cassette.edit') }}: {{ cassette.name }}</h3>
            
            <div class="cassette-editor__content">
                <p class="cassette-editor__description">
                    {{ $t('cassette.mapLayers') }}
                </p>

                <div class="cassette-editor__mapping">
                    <div 
                        v-for="layer in cassetteLayerTypes" 
                        :key="layer"
                        class="cassette-editor__layer"
                    >
                        <label class="cassette-editor__layer-label">{{ layer }}:</label>
                        <select 
                            v-model="layerMapping[layer]"
                            multiple
                            class="cassette-editor__layer-select"
                        >
                            <option 
                                v-for="dxfLayer in detectedLayers" 
                                :key="dxfLayer"
                                :value="dxfLayer"
                            >
                                {{ dxfLayer }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="cassette-editor__actions">
                    <MainButton 
                        @click="$emit('close')" 
                        :label="$t('common.cancel')" 
                        :theme="themeType.secondary" 
                        :size="sizeType.m" 
                    />
                    <MainButton 
                        @click="handleSave" 
                        :label="$t('common.save')" 
                        :theme="themeType.primary" 
                        :size="sizeType.m"
                    />
                </div>
            </div>
        </div>
    </DialogWrapper>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import { themeType } from '~/constants/theme.constants';
import { sizeType } from '~/constants/size.constants';
import DialogWrapper from './DialogWrapper.vue';
import MainButton from './MainButton.vue';

const props = defineProps({
    cassette: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['close', 'saved']);

const { actions } = cassettesStore;
const { mapLayers } = actions;

const isOpen = ref(true);
const cassetteLayerTypes = ['cut', 'bend', 'frame', 'dimensions'];
const detectedLayers = props.cassette.detectedLayers || [];

const layerMapping = reactive({
    cut: props.cassette.layerMapping?.cut || [],
    bend: props.cassette.layerMapping?.bend || [],
    frame: props.cassette.layerMapping?.frame || [],
    dimensions: props.cassette.layerMapping?.dimensions || []
});

const handleSave = async () => {
    try {
        await mapLayers(props.cassette._id, layerMapping);
        emit('saved');
    } catch (error) {
        console.error('Failed to save layer mapping:', error);
    }
};
</script>

<style lang="scss" scoped>
.cassette-editor {
    $self: &;
    padding: 24px;
    min-width: 500px;
    max-width: 600px;

    &__title {
        font-size: 20px;
        font-weight: 600;
        color: var(--label-primary);
        margin-bottom: 16px;
    }

    &__description {
        color: var(--label-secondary);
        margin-bottom: 24px;
    }

    &__mapping {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 24px;
    }

    &__layer {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    &__layer-label {
        font-weight: 500;
        color: var(--label-primary);
        text-transform: capitalize;
    }

    &__layer-select {
        padding: 8px;
        border: 1px solid var(--separator-primary);
        border-radius: 8px;
        background-color: var(--background-primary);
        color: var(--label-primary);
        min-height: 80px;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
}
</style>
