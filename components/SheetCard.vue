<template>
    <div class="sheet-card">
        <div class="sheet-card__header">
            <div class="sheet-card__info">
                <h3 class="sheet-card__title">{{ $t('results.sheet') }} {{ sheet.number }}</h3>
                <SheetStatusTag v-if="sheet.status" :status="sheet.status" />
            </div>
            <div v-if="sheet.material" class="sheet-card__material">
                {{ sheet.material }}
            </div>
        </div>

        <div class="sheet-card__preview">
            <SvgDisplay 
                v-if="sheet.svgUrl" 
                :src="sheet.svgUrl" 
                :size="sizeType.m"
                class="sheet-card__svg"
            />
            <div v-else class="sheet-card__placeholder">
                {{ $t('common.loading') }}
            </div>
        </div>

        <div class="sheet-card__stats">
            <div class="sheet-card__stat">
                <span class="sheet-card__stat-label">{{ $t('results.parts') }}:</span>
                <span class="sheet-card__stat-value">{{ sheet.partsCount || 0 }}</span>
            </div>
            <div class="sheet-card__stat">
                <span class="sheet-card__stat-label">{{ $t('results.efficiency') }}:</span>
                <span class="sheet-card__stat-value">{{ formatEfficiency(sheet.efficiency) }}</span>
            </div>
            <div v-if="sheet.area" class="sheet-card__stat">
                <span class="sheet-card__stat-label">{{ $t('results.area') }}:</span>
                <span class="sheet-card__stat-value">{{ formatArea(sheet.area) }}</span>
            </div>
        </div>

        <div class="sheet-card__actions">
            <MainButton 
                v-if="sheet.dxfUrl"
                :href="sheet.dxfUrl"
                :label="$t('results.downloadDxf')"
                tag="a"
                :theme="themeType.secondary"
                :size="sizeType.s"
            />
            <MainButton 
                v-if="sheet.pdfUrl"
                :href="sheet.pdfUrl"
                :label="$t('results.downloadPdf')"
                tag="a"
                :theme="themeType.primary"
                :size="sizeType.s"
            />
        </div>
    </div>
</template>

<script setup>
import { sizeType } from '~/constants/size.constants';
import { themeType } from '~/constants/theme.constants';
import SheetStatusTag from './SheetStatusTag.vue';
import SvgDisplay from './SvgDisplay.vue';
import MainButton from './MainButton.vue';

defineProps({
    sheet: {
        type: Object,
        required: true
    }
});

const formatEfficiency = (efficiency) => {
    if (!efficiency) return '0%';
    return `${Math.round(efficiency * 100)}%`;
};

const formatArea = (area) => {
    if (!area) return '0 m²';
    return `${(area / 1000000).toFixed(2)} m²`;
};
</script>

<style lang="scss" scoped>
.sheet-card {
    border: 1px solid var(--separator-secondary);
    border-radius: 12px;
    padding: 16px;
    background-color: var(--background-primary);
    transition: border-color 0.3s;

    &:hover {
        border-color: var(--separator-primary);
    }

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
    }

    &__info {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    &__title {
        font-size: 18px;
        font-weight: 600;
        color: var(--label-primary);
        margin: 0;
    }

    &__material {
        font-size: 14px;
        color: var(--label-secondary);
        padding: 4px 8px;
        background: var(--fill-secondary);
        border-radius: 6px;
    }

    &__preview {
        width: 100%;
        aspect-ratio: 16 / 9;
        border-radius: 8px;
        overflow: hidden;
        background: var(--background-secondary);
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    &__svg {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    &__placeholder {
        color: var(--label-tertiary);
        font-size: 14px;
    }

    &__stats {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        padding: 12px;
        background: var(--fill-secondary);
        border-radius: 8px;
    }

    &__stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    &__stat-label {
        font-size: 12px;
        color: var(--label-tertiary);
    }

    &__stat-value {
        font-size: 16px;
        font-weight: 600;
        color: var(--label-primary);
    }

    &__actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
    }
}
</style>
