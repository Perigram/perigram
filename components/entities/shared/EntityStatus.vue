<script setup>
/**
 * Universal Status Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Popover from 'primevue/popover';
import UserCard from '../User/UserCard.vue';
import { ref, computed } from 'vue';
import { useStatus } from '~/composables/useBlocks';

const props = defineProps({

  entity: { type: Object, required: true },

  variant: { type: String, default: 'inline' },

  actions: { type: Array, default: () => [] } // Array of { label, icon, severity, command, disabled, permission }

});



const { state, timestamp, metadata, statusColor } = useStatus(props.entity);

const op = ref();



const toggle = (event) => {

    if (props.actions.length > 0 || timestamp.value) {

        op.value.toggle(event);

    }

};



const visibleActions = computed(() => {

    return props.actions.filter(a => {

        if (!a.permission) return true;

        // Simple permission check if needed, or assume parent filtered

        return true;

    });

});

</script>



<template>



  <div class="flex items-center gap-2">



    <template v-if="variant === 'inline' || variant === 'compact'">



      <Tag 



        :value="state" 



        :severity="statusColor" 



        class="cursor-pointer hover:opacity-80 transition-opacity"



        @click="toggle"



      />



    </template>







    <template v-else>



      <div class="flex flex-col items-end gap-1 text-right">



        <Tag :value="state" :severity="statusColor" class="cursor-pointer" @click="toggle" />



        <div v-if="timestamp" class="flex flex-col text-[10px] opacity-50">



            <span>{{ timestamp.toLocaleDateString() }}</span>



            <span>{{ timestamp.toLocaleTimeString() }}</span>



        </div>



        <small v-if="metadata?.note" class="italic opacity-60 text-[10px]">"{{ metadata.note }}"</small>



      </div>



    </template>







    <Popover ref="op">



        <div class="flex flex-col gap-4 min-w-48">



            <!-- Actions Section -->



            <div v-if="visibleActions.length > 0" class="flex flex-col gap-2">



                <span class="text-[10px] font-bold uppercase opacity-40 tracking-widest">{{ $t('common.actions.title') }}</span>



                <div class="flex flex-col gap-1">



                    <Button 



                        v-for="(action, idx) in visibleActions" 



                        :key="idx"



                        :label="action.label"



                        :icon="action.icon"



                        :severity="action.severity || 'secondary'"



                        :disabled="action.disabled"



                        size="small"



                        text



                        class="justify-start font-bold text-xs py-2"



                        @click="() => { action.command(); op.hide(); }"



                    />



                </div>



                <hr class="border-surface-200 dark:border-surface-800 my-1" v-if="timestamp" />



            </div>







            <!-- Info Section -->



            <div v-if="timestamp" class="flex flex-col gap-3">



                <div class="flex flex-col">



                    <small class="text-[10px] font-bold uppercase opacity-40 tracking-widest">Last Updated</small>



                    <span class="text-xs font-bold">{{ timestamp?.toLocaleString() }}</span>



                </div>



                <div v-if="metadata?.note" class="flex flex-col">



                    <small class="text-[10px] font-bold uppercase opacity-40 tracking-widest">Note</small>



                    <span class="text-xs italic opacity-80">"{{ metadata.note }}"</span>



                </div>



            </div>



        </div>



    </Popover>



  </div>



</template>
