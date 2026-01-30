<script setup>
/**
 * Organization View Component - v24 Standardized
 */
import Card from 'primevue/card';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  organization: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.organization);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded bg-primary flex items-center justify-center text-[10px] text-white font-black">
            {{ name.charAt(0) }}
        </div>
        <span class="text-xs font-medium">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-3 p-2 bg-surface-0 dark:bg-surface-900 border rounded-xl pr-4">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-black">
            {{ name.charAt(0) }}
        </div>
        <div class="flex flex-col">
            <span class="text-sm font-bold leading-none">{{ name }}</span>
            <small class="text-[10px] opacity-50 uppercase font-bold">{{ organization.type || 'Standard' }}</small>
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <div class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl flex flex-col gap-4 h-full">
        <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white text-xl font-black shadow-md">
                {{ name.charAt(0) }}
            </div>
            <div class="flex flex-col">
                <span class="font-bold text-sm">{{ name }}</span>
                <span class="text-[10px] opacity-50 font-bold uppercase tracking-widest">{{ organization.type || 'Standard' }}</span>
            </div>
        </div>
        
        <div class="flex flex-col gap-2 pt-3 border-t border-surface-50 dark:border-surface-800 text-xs">
            <div class="flex justify-between items-center">
                <span class="opacity-50 uppercase font-bold text-[10px]">{{ $t('features.billingStatus') }}</span>
                <Tag :value="organization.billing?.status || 'ACTIVE'" severity="info" class="scale-90" />
            </div>
            <div class="flex justify-between items-center">
                <span class="opacity-50 uppercase font-bold text-[10px]">{{ $t('common.created') }}</span>
                <span class="font-mono opacity-60">{{ new Date().toLocaleDateString() }}</span>
            </div>
        </div>
      </div>
    </template>
  </div>
</template>
