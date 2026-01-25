<script setup>
/**
 * Organization View Component - v24 Standardized
 */
import Card from 'primevue/card';

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
        <span class="text-xs font-bold">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-3 p-2 bg-surface-0 dark:bg-surface-900 border rounded-xl pr-4">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-black">
            {{ name.charAt(0) }}
        </div>
        <div class="flex flex-col">
            <span class="text-sm font-bold leading-none">{{ name }}</span>
            <small class="text-[10px] opacity-50 uppercase">{{ organization.type || 'Standard' }}</small>
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white text-xl font-black shadow-lg">
                    {{ name.charAt(0) }}
                </div>
                <div class="flex flex-col">
                    <span class="font-bold">{{ name }}</span>
                    <span class="text-xs opacity-50 font-normal uppercase tracking-widest">{{ organization.type || 'Standard' }}</span>
                </div>
            </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-3 pt-4 border-t border-surface">
                <div class="flex justify-between items-center text-sm">
                    <span class="opacity-50">Billing Status</span>
                    <Tag :value="organization.billing?.status || 'ACTIVE'" severity="info" />
                </div>
                <div class="flex justify-between items-center text-sm">
                    <span class="opacity-50">Created</span>
                    <span class="font-mono">{{ new Date().toLocaleDateString() }}</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
