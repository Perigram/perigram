<template>
    <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
            <label>{{ $t('profile.name') }}</label>
            <InputText v-model="form.name" />
        </div>
        <div class="flex flex-col gap-2">
            <label>{{ $t('profile.email') }}</label>
            <InputText v-model="form.email" type="email" />
        </div>
        <div class="flex flex-col gap-2" v-if="!editMode">
            <label>{{ $t('profile.password') }}</label>
            <Password v-model="form.password" :feedback="false" toggleMask />
        </div>
        <div class="flex flex-col gap-2">
            <label>{{ $t('auth.accessPreset') }}</label>
            <Select 
                v-model="form.role" 
                :options="roles" 
                :placeholder="$t('auth.selectAccessPreset')" 
            />
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <Button :label="$t('common.cancel')" severity="secondary" text @click="$emit('cancel')" />
            <Button :label="editMode ? $t('common.update') : $t('common.create')" @click="handleSubmit" />
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Select from '~/components/shared/InstanceSelect.vue';
import { USER_ROLES } from '~/constants/roles.constants';

const props = defineProps({
    user: {
        type: Object,
        default: null
    }
});

const emit = defineEmits(['save', 'cancel']);

const editMode = computed(() => !!props.user);

const form = ref({
    name: props.user?.identity?.name || '',
    email: props.user?.data?.email || '',
    password: '',
    role: props.user?.data?.role || 'IndividualUser'
});

const roles = USER_ROLES;

const handleSubmit = () => {
    emit('save', form.value);
};
</script>
